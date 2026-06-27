import { createHash } from "node:crypto";

import {
  createDispatchDecidedEvent,
  createMatchDecidedEvent,
} from "../../control-plane-event-schema-contract/src/control-plane-events.mjs";

export const DISPATCHER_MAXIMIZE_CREDITS_VERSION = "hobo.dispatcher-maximize-credits/v1";

const OBJECTIVES = new Set(["maximize-credits"]);
const DISPATCH_CATEGORIES = new Set(["runner", "build-machine"]);
const CATEGORY_DIMENSIONS = Object.freeze({
  runner: "runner.minutes",
  "build-machine": "build.minutes",
});
const LARGE_SCORE = Number.MAX_SAFE_INTEGER;
const SHA256_REF = /^sha256:[a-f0-9]{64}$/;

export function createDispatcherRegistry(providers = []) {
  if (!Array.isArray(providers)) {
    throw new TypeError("providers must be an array");
  }

  const records = providers.map(normalizeDispatchProvider);
  const byCategory = new Map();
  for (const record of records) {
    if (!record.registered) continue;
    const bucket = byCategory.get(record.category) ?? [];
    bucket.push(record);
    byCategory.set(record.category, bucket);
  }

  return {
    schema: `${DISPATCHER_MAXIMIZE_CREDITS_VERSION}.registry`,
    records,
    byCategory,
  };
}

export function decideDispatch(request) {
  assertObject(request, "request");
  const category = requireCategory(request.category);
  const objective = requireObjective(request.objective ?? "maximize-credits");
  const dispatchId = requireString(request.dispatchId, "request.dispatchId");
  const units = requirePositiveNumber(request.units ?? 1, "request.units");
  const registry = normalizeRegistry(request.registry);
  const candidates = registry.byCategory.get(category) ?? [];
  const ledgerView = normalizeLedgerView(request.ledgerView);

  if (candidates.length === 0) {
    return failedDecision({
      objective,
      reason: `no registered ${category} candidates`,
    });
  }

  const ranked = rankCreditCandidates({
    candidates,
    ledgerView,
    units,
    incumbentProviderId: request.incumbentProviderId,
  });
  const winner = ranked[0];
  const dispatchEvent = createDispatchDecidedEvent({
    dispatchId,
    category,
    selectedProvider: winner.providerId,
    objective,
    ledgerInput: {
      view: "CreditLedgerView",
      seq: ledgerView.seq,
      reservationId: `reservation-intent-${dispatchId}`,
      balanceHash: ledgerBalanceHash(ledgerView),
    },
    candidates: ranked.map((candidate) => ({
      provider: candidate.providerId,
      effectiveMarginalCost: candidate.effectiveMarginalCost,
    })),
  });

  return {
    ok: true,
    schema: DISPATCHER_MAXIMIZE_CREDITS_VERSION,
    objective,
    selectedProvider: winner.providerId,
    ranking: publicDispatchRanking(ranked),
    dispatchEvent,
    replayInput: {
      category,
      dispatchId,
      objective,
      units,
      incumbentProviderId: request.incumbentProviderId,
      ledgerView: clone(ledgerView),
      candidates: registry.records.map((record) => clone(record.source)),
    },
  };
}

export function replayDispatchDecision(replayInput) {
  assertObject(replayInput, "replayInput");
  return decideDispatch({
    ...clone(replayInput),
    registry: createDispatcherRegistry(replayInput.candidates ?? []),
  });
}

export function decidePlacement(request) {
  assertObject(request, "request");
  const objective = requireObjective(request.objective ?? "maximize-credits");
  const resourceId = requireString(request.resourceId, "request.resourceId");
  const resourceType = requireString(request.resourceType, "request.resourceType");
  const units = requirePositiveNumber(request.units ?? 1, "request.units");
  const ledgerView = normalizeLedgerView(request.ledgerView);
  const rejectedCandidates = [];
  const candidates = [];

  for (const candidate of request.candidates ?? []) {
    const normalized = normalizePlacementCandidate(candidate);
    if (!normalized.registered) {
      rejectedCandidates.push({
        definitionId: normalized.definitionId,
        reason: "candidate is not registered",
      });
      continue;
    }
    if (normalized.resourceType !== resourceType) {
      rejectedCandidates.push({
        definitionId: normalized.definitionId,
        reason: `resourceType ${normalized.resourceType} does not match ${resourceType}`,
      });
      continue;
    }
    candidates.push(normalized);
  }

  if (candidates.length === 0) {
    return failedDecision({
      objective,
      reason: `no registered ${resourceType} placement candidates`,
      rejectedCandidates,
    });
  }

  const ranked = rankCreditCandidates({
    candidates,
    ledgerView,
    units,
    incumbentProviderId: request.incumbentProviderId,
  });
  const winner = ranked[0];
  const tiedDefinitionIds = ranked
    .filter((candidate) => compareDecisionVector(candidate, winner) === 0)
    .map((candidate) => candidate.definitionId);
  const ranking = publicPlacementRanking(ranked);
  const matchEvent = createMatchDecidedEvent({
    resourceId,
    winner: winner.definitionId,
    ranking,
    rejectedCandidates,
    objective,
    tie: tiedDefinitionIds.length > 1,
    catalogContentHash: normalizeHashRef(
      request.catalogContentHash ?? stableHash({ resourceType, candidates: candidates.map((candidate) => candidate.source) }),
    ),
  });

  return {
    ok: true,
    schema: DISPATCHER_MAXIMIZE_CREDITS_VERSION,
    objective,
    winner: winner.definitionId,
    selectedProvider: winner.providerId,
    ranking,
    rejectedCandidates,
    tiedDefinitionIds,
    matchEvent,
  };
}

function rankCreditCandidates({ candidates, ledgerView, units, incumbentProviderId }) {
  return candidates
    .map((candidate) => rankCreditCandidate({ candidate, ledgerView, units, incumbentProviderId }))
    .sort(compareRankedCandidates)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}

function rankCreditCandidate({ candidate, ledgerView, units, incumbentProviderId }) {
  const account = findLedgerAccount(ledgerView, candidate.providerId, candidate.dimension);
  const credit = creditFactsFor(account, candidate);
  const listUnitCost = credit.listUnitCost;
  const freeUnits = credit.valid
    ? Math.min(units, credit.freeHeadroom, credit.rateHeadroom, credit.concurrencyHeadroom > 0 ? LARGE_SCORE : 0)
    : 0;
  const paidUnits = Math.max(0, units - freeUnits);
  const switchingCost = incumbentProviderId && candidate.providerId !== incumbentProviderId
    ? nonNegativeNumber(candidate.switchingCost, "candidate.switchingCost", 0)
    : 0;
  const baseCost = roundCost(paidUnits * listUnitCost);
  const totalCost = roundCost(baseCost + switchingCost);
  const budgetExceeded = totalCost > credit.budgetHeadroom;
  const effectiveMarginalCost = roundCost(totalCost / units);
  const freeButNotDepletable = credit.valid && credit.freeHeadroom > 0 && freeUnits === 0;
  const nextCreditExpiresAt = credit.valid ? nextCreditExpiry(account) : null;
  const concurrencyScore = Number.isFinite(credit.concurrencyHeadroom)
    ? credit.concurrencyHeadroom
    : LARGE_SCORE;
  const expiryScore = freeUnits > 0 && nextCreditExpiresAt ? Date.parse(nextCreditExpiresAt) : LARGE_SCORE;
  const rationale = rationaleFor({
    credit,
    ledgerView,
    freeUnits,
    paidUnits,
    switchingCost,
    freeButNotDepletable,
  });

  return {
    ...candidate,
    totalCost,
    baseCost,
    listUnitCost,
    effectiveMarginalCost,
    freeUnits: roundQuantity(freeUnits),
    paidUnits: roundQuantity(paidUnits),
    switchingCost,
    budgetExceeded,
    creditFacts: credit.status,
    nextCreditExpiresAt,
    objectiveScore: effectiveMarginalCost,
    rationale,
    decisionVector: [
      budgetExceeded ? 1 : 0,
      effectiveMarginalCost,
      expiryScore,
      -concurrencyScore,
      listUnitCost,
      switchingCost,
    ],
    rankVector: [
      budgetExceeded ? 1 : 0,
      effectiveMarginalCost,
      expiryScore,
      -concurrencyScore,
      listUnitCost,
      switchingCost,
      candidate.providerId,
      candidate.definitionId ?? candidate.providerId,
    ],
  };
}

function creditFactsFor(account, candidate) {
  if (!account) {
    return {
      status: "missing",
      valid: false,
      listUnitCost: nonNegativeNumber(candidate.listUnitCost, "candidate.listUnitCost", LARGE_SCORE),
      freeHeadroom: 0,
      rateHeadroom: 0,
      concurrencyHeadroom: 0,
      budgetHeadroom: LARGE_SCORE,
    };
  }

  const listUnitCost = optionalNonNegativeNumber(account.listUnitCost)
    ? account.listUnitCost
    : nonNegativeNumber(candidate.listUnitCost, "candidate.listUnitCost", LARGE_SCORE);
  const freeHeadroom = freeHeadroomFor(account);
  const rateHeadroom = account.rateHeadroom === undefined ? LARGE_SCORE : account.rateHeadroom;
  const concurrencyHeadroom = account.concurrencyHeadroom === undefined ? LARGE_SCORE : account.concurrencyHeadroom;
  const budgetHeadroom = budgetHeadroomFor(account);
  const valid = [listUnitCost, freeHeadroom, rateHeadroom, concurrencyHeadroom, budgetHeadroom].every(optionalNonNegativeNumber);

  if (!valid) {
    return {
      status: "invalid",
      valid: false,
      listUnitCost: nonNegativeNumber(candidate.listUnitCost, "candidate.listUnitCost", LARGE_SCORE),
      freeHeadroom: 0,
      rateHeadroom: 0,
      concurrencyHeadroom: 0,
      budgetHeadroom: LARGE_SCORE,
    };
  }

  return {
    status: freeHeadroom > 0 ? "present" : "present-empty",
    valid: true,
    listUnitCost,
    freeHeadroom,
    rateHeadroom,
    concurrencyHeadroom,
    budgetHeadroom,
  };
}

function freeHeadroomFor(account) {
  if (account.freeHeadroom !== undefined) return account.freeHeadroom;
  if (!Array.isArray(account.credits)) return 0;
  return account.credits.reduce((total, credit) => {
    if (!optionalNonNegativeNumber(credit?.freeHeadroom)) return Number.NaN;
    return total + credit.freeHeadroom;
  }, 0);
}

function nextCreditExpiry(account) {
  const expiries = (account?.credits ?? [])
    .filter((credit) => optionalNonNegativeNumber(credit?.freeHeadroom) && credit.freeHeadroom > 0)
    .map((credit) => credit.expiresAt ?? credit.windowEnd)
    .filter((value) => typeof value === "string" && !Number.isNaN(Date.parse(value)))
    .sort((left, right) => Date.parse(left) - Date.parse(right) || left.localeCompare(right));
  return expiries[0] ?? null;
}

function budgetHeadroomFor(account) {
  if (account.budgetCap === undefined && account.spendToDate === undefined) return LARGE_SCORE;
  const budgetCap = account.budgetCap === undefined ? LARGE_SCORE : account.budgetCap;
  const spendToDate = account.spendToDate === undefined ? 0 : account.spendToDate;
  if (!optionalNonNegativeNumber(budgetCap) || !optionalNonNegativeNumber(spendToDate)) {
    return Number.NaN;
  }
  return Math.max(0, budgetCap - spendToDate);
}


function compareRankedCandidates(left, right) {
  for (let index = 0; index < Math.max(left.rankVector.length, right.rankVector.length); index += 1) {
    const leftValue = left.rankVector[index];
    const rightValue = right.rankVector[index];
    if (typeof leftValue === "string" || typeof rightValue === "string") {
      const comparison = String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
      if (comparison !== 0) return comparison;
      continue;
    }
    if ((leftValue ?? LARGE_SCORE) < (rightValue ?? LARGE_SCORE)) return -1;
    if ((leftValue ?? LARGE_SCORE) > (rightValue ?? LARGE_SCORE)) return 1;
  }
  return 0;
}

function compareDecisionVector(left, right) {
  for (let index = 0; index < Math.max(left.decisionVector.length, right.decisionVector.length); index += 1) {
    const leftValue = left.decisionVector[index] ?? LARGE_SCORE;
    const rightValue = right.decisionVector[index] ?? LARGE_SCORE;
    if (leftValue < rightValue) return -1;
    if (leftValue > rightValue) return 1;
  }
  return 0;
}

function publicDispatchRanking(ranked) {
  return ranked.map((candidate) => ({
    providerId: candidate.providerId,
    category: candidate.category,
    rank: candidate.rank,
    effectiveMarginalCost: candidate.effectiveMarginalCost,
    totalCost: candidate.totalCost,
    freeUnits: candidate.freeUnits,
    paidUnits: candidate.paidUnits,
    switchingCost: candidate.switchingCost,
    budgetExceeded: candidate.budgetExceeded,
    creditFacts: candidate.creditFacts,
    nextCreditExpiresAt: candidate.nextCreditExpiresAt,
    rationale: candidate.rationale,
  }));
}

function publicPlacementRanking(ranked) {
  return ranked.map((candidate) => ({
    definitionId: candidate.definitionId,
    region: candidate.region,
    specificity: candidate.specificity,
    priority: candidate.priority,
    objectiveScore: candidate.objectiveScore,
    rank: candidate.rank,
    rationale: candidate.rationale,
  }));
}

function rationaleFor({ credit, ledgerView, freeUnits, paidUnits, switchingCost, freeButNotDepletable }) {
  const parts = [
    "objective=maximize-credits",
    `ledgerSeq=${ledgerView.seq}`,
    `credit-facts=${credit.status}`,
    `freeUnits=${roundQuantity(freeUnits)}`,
    `paidUnits=${roundQuantity(paidUnits)}`,
    `switchingCost=${switchingCost}`,
  ];
  if (freeButNotDepletable) {
    parts.push("free-tier-not-depletable");
  }
  if (credit.budgetHeadroom < LARGE_SCORE && paidUnits > 0 && paidUnits * credit.listUnitCost + switchingCost > credit.budgetHeadroom) {
    parts.push("budget-cap-exceeded");
  }
  return parts.join("; ");
}

function findLedgerAccount(ledgerView, providerId, dimension) {
  return (ledgerView.accounts ?? []).find(
    (account) => account?.providerId === providerId && account?.dimension === dimension,
  ) ?? null;
}

function normalizeDispatchProvider(provider) {
  assertObject(provider, "provider");
  const category = requireCategory(provider.category);
  const id = requireString(provider.id ?? provider.providerId, "provider.id");
  const providerId = requireString(provider.providerId ?? id, "provider.providerId");
  return {
    id,
    providerId,
    definitionId: id,
    category,
    registered: provider.registered !== false,
    dimension: provider.dimension ?? CATEGORY_DIMENSIONS[category],
    listUnitCost: nonNegativeNumber(provider.listUnitCost, "provider.listUnitCost", 0),
    switchingCost: nonNegativeNumber(provider.switchingCost ?? 0, "provider.switchingCost", 0),
    source: clone(provider),
  };
}

function normalizePlacementCandidate(candidate) {
  assertObject(candidate, "candidate");
  const definitionId = requireString(candidate.definitionId ?? candidate.id, "candidate.definitionId");
  const providerId = requireString(candidate.providerId ?? definitionId, "candidate.providerId");
  return {
    definitionId,
    providerId,
    category: "placement",
    registered: candidate.registered !== false,
    resourceType: requireString(candidate.resourceType, "candidate.resourceType"),
    dimension: requireString(candidate.dimension, "candidate.dimension"),
    listUnitCost: nonNegativeNumber(candidate.listUnitCost, "candidate.listUnitCost", 0),
    specificity: Number.isFinite(candidate.specificity) ? candidate.specificity : 0,
    priority: Number.isInteger(candidate.priority) ? candidate.priority : 0,
    region: typeof candidate.region === "string" && candidate.region.length > 0 ? candidate.region : undefined,
    switchingCost: nonNegativeNumber(candidate.switchingCost ?? 0, "candidate.switchingCost", 0),
    source: clone(candidate),
  };
}

function normalizeRegistry(registry) {
  if (Array.isArray(registry)) {
    return createDispatcherRegistry(registry);
  }
  if (!registry || !(registry.byCategory instanceof Map) || !Array.isArray(registry.records)) {
    throw new TypeError("request.registry must be a Dispatcher registry");
  }
  return registry;
}

function normalizeLedgerView(ledgerView) {
  if (!ledgerView || typeof ledgerView !== "object" || Array.isArray(ledgerView)) {
    throw new TypeError("request.ledgerView must be a CreditLedgerView snapshot");
  }
  if (ledgerView.view !== "CreditLedgerView") {
    throw new TypeError("request.ledgerView.view must be CreditLedgerView");
  }
  if (!Number.isInteger(ledgerView.seq) || ledgerView.seq < 0) {
    throw new TypeError("request.ledgerView.seq must be a non-negative integer");
  }
  if (!Array.isArray(ledgerView.accounts)) {
    throw new TypeError("request.ledgerView.accounts must be an array");
  }
  return clone(ledgerView);
}

function failedDecision({ objective, reason, rejectedCandidates = [] }) {
  return {
    ok: false,
    schema: DISPATCHER_MAXIMIZE_CREDITS_VERSION,
    objective,
    reason,
    ranking: [],
    rejectedCandidates,
  };
}

function ledgerBalanceHash(ledgerView) {
  return normalizeHashRef(ledgerView.balanceHash ?? ledgerView.digest ?? stableHash(ledgerView));
}

function normalizeHashRef(value) {
  if (typeof value === "string" && SHA256_REF.test(value)) return value;
  if (typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) return `sha256:${value}`;
  return stableHash(value);
}

function stableHash(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

function requireCategory(category) {
  if (!DISPATCH_CATEGORIES.has(category)) {
    throw new TypeError("category must be runner or build-machine");
  }
  return category;
}

function requireObjective(objective) {
  if (!OBJECTIVES.has(objective)) {
    throw new TypeError("objective must be maximize-credits");
  }
  return objective;
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function requirePositiveNumber(value, fieldName) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${fieldName} must be greater than 0`);
  }
  return value;
}

function nonNegativeNumber(value, fieldName, fallback) {
  if (value === undefined) return fallback;
  if (!optionalNonNegativeNumber(value)) {
    throw new TypeError(`${fieldName} must be a non-negative number`);
  }
  return value;
}

function optionalNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function roundCost(value) {
  return Number(value.toFixed(12));
}

function roundQuantity(value) {
  return Number(value.toFixed(9));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
