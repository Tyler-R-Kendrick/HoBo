import { createHash } from "node:crypto";

import {
  canonicalJson,
  createDecision,
  createDecisionRequest,
  createPolicyDecidedEvent,
} from "../../hobo-policy-ir-contract/src/policy-ir.mjs";

export const BUDGET_QUOTA_POLICY_ENGINE_ID = "hobo.budget-quota-policy/contract@0.1.0";
export const BUDGET_QUOTA_POLICY_SCHEMA_VERSION = "hobo.budget-quota-policy/v1";

const SCOPE_KINDS = new Set(["tenant", "camp", "agent"]);
const APPROVAL_DECISIONS = new Set(["approved", "denied"]);

export function evaluateBudgetQuotaPolicy(input) {
  const source = expectObject(input, "input");
  const request = createDecisionRequest(source.request);
  const meteringView = normalizeMeteringView(source.meteringView);
  const policies = normalizePolicies(source.policies);
  const approval = normalizeApproval(source.approval);
  const estimateUsd = readCost(request.context, "costEstimateUsd", "estimatedCostUsd");
  const actualUsd = readOptionalCost(request.context, "actualCostUsd");

  const state = {
    request,
    meteringView,
    estimateUsd,
    actualUsd,
    approval,
    evaluations: [],
    events: [],
    obligations: [],
    approvals: [],
    violations: [],
    stalePolicies: [],
    hardViolations: [],
    approvalDenied: [],
    approvalNeeded: [],
    driftPolicies: [],
  };

  for (const policy of policies) {
    evaluatePolicy(state, policy);
  }

  const decision = createDecision(request, {
    effect: chooseEffect(state),
    reason: chooseReason(state),
    violations: state.violations,
    approvals: state.approvals,
    obligations: state.obligations,
    evidence: {
      engine: BUDGET_QUOTA_POLICY_ENGINE_ID,
      policyIds: policies.map((policy) => policy.id),
    },
  });

  const policyEvent = createAuditedPolicyEvent({
    request,
    decision,
    meteringView,
    estimateUsd,
    actualUsd,
    actorId: readActorId(request),
    approverId: approval?.approverId ?? null,
    policyIds: policies.map((policy) => policy.id),
  });

  return {
    schemaVersion: BUDGET_QUOTA_POLICY_SCHEMA_VERSION,
    request,
    decision,
    events: [policyEvent, ...state.events],
    evaluations: state.evaluations,
  };
}

function evaluatePolicy(state, policy) {
  const currentSpendUsd = readScopeSpend(state.meteringView, policy.scope);
  const projectedSpendUsd = roundUsd(currentSpendUsd + state.estimateUsd);
  const actualProjectedSpendUsd =
    state.actualUsd === null ? null : roundUsd(currentSpendUsd + state.actualUsd);
  const evaluation = {
    policyId: policy.id,
    scope: policy.scope,
    currentSpendUsd,
    estimatedCostUsd: state.estimateUsd,
    projectedSpendUsd,
    actualCostUsd: state.actualUsd,
    actualProjectedSpendUsd,
    meteringViewSeq: state.meteringView.seq,
  };
  state.evaluations.push(evaluation);

  if (state.meteringView.seq < policy.lastEvaluatedSeq) {
    state.stalePolicies.push(policy);
    state.violations.push(
      `${policy.id}: out-of-order MeteringView seq ${state.meteringView.seq} is older than ${policy.lastEvaluatedSeq}`,
    );
    state.events.push(
      createSpendEvent({
        type: "spend.CounterOutOfOrder",
        request: state.request,
        meteringView: state.meteringView,
        policy,
        currentSpendUsd,
        projectedSpendUsd,
        extra: {
          lastEvaluatedSeq: policy.lastEvaluatedSeq,
        },
      }),
    );
    return;
  }

  evaluateBudgetThresholds(state, policy, { currentSpendUsd, projectedSpendUsd });
  evaluateAgentSpendCap(state, policy, { currentSpendUsd, projectedSpendUsd });
  evaluateEstimateDrift(state, policy, {
    currentSpendUsd,
    projectedSpendUsd,
    actualProjectedSpendUsd,
  });
}

function evaluateBudgetThresholds(state, policy, { currentSpendUsd, projectedSpendUsd }) {
  if (policy.hardLimitUsd !== null && projectedSpendUsd > policy.hardLimitUsd) {
    state.hardViolations.push(policy);
    state.violations.push(
      `${policy.id}: projected spend ${projectedSpendUsd} exceeds hard budget ${policy.hardLimitUsd}`,
    );
    state.events.push(
      createSpendEvent({
        type: "spend.BudgetThresholdCrossed",
        request: state.request,
        meteringView: state.meteringView,
        policy,
        currentSpendUsd,
        projectedSpendUsd,
        extra: {
          thresholdUsd: policy.hardLimitUsd,
          severity: "hard",
          blocked: true,
        },
      }),
    );
    maybeAddCompensationObligation(state);
    return;
  }

  if (policy.softLimitUsd !== null && projectedSpendUsd > policy.softLimitUsd) {
    state.obligations.push({
      kind: "spend.warn-threshold",
      policyId: policy.id,
      scope: policy.scope,
      thresholdUsd: policy.softLimitUsd,
      currentSpendUsd,
      projectedSpendUsd,
    });
    state.events.push(
      createSpendEvent({
        type: "spend.BudgetThresholdCrossed",
        request: state.request,
        meteringView: state.meteringView,
        policy,
        currentSpendUsd,
        projectedSpendUsd,
        extra: {
          thresholdUsd: policy.softLimitUsd,
          severity: "soft",
          blocked: false,
        },
      }),
    );
  }
}

function evaluateAgentSpendCap(state, policy, { currentSpendUsd, projectedSpendUsd }) {
  if (policy.spendCapUsd === null || projectedSpendUsd <= policy.spendCapUsd) {
    return;
  }

  state.events.push(
    createSpendEvent({
      type: "spend.CapGateEvaluated",
      request: state.request,
      meteringView: state.meteringView,
      policy,
      currentSpendUsd,
      projectedSpendUsd,
      extra: {
        spendCapUsd: policy.spendCapUsd,
        capExceeded: true,
      },
    }),
  );

  if (!state.approval) {
    state.approvalNeeded.push(policy);
    state.obligations.push({
      kind: "spend.agent-cap-approval",
      policyId: policy.id,
      scope: policy.scope,
      spendCapUsd: policy.spendCapUsd,
      currentSpendUsd,
      projectedSpendUsd,
      allowedApprovers: policy.allowedApprovers,
    });
    return;
  }

  if (state.approval.decision === "denied") {
    state.approvalDenied.push(policy);
    state.violations.push(`${policy.id}: approval denied by ${state.approval.approverId}`);
    return;
  }

  if (policy.allowedApprovers.length > 0 && !policy.allowedApprovers.includes(state.approval.approverId)) {
    state.approvalDenied.push(policy);
    state.violations.push(`${policy.id}: ${state.approval.approverId} is not an allowed approver`);
    return;
  }

  state.approvals.push({
    policyId: policy.id,
    approverId: state.approval.approverId,
    approvedAt: state.approval.approvedAt,
    projectedSpendUsd,
    spendCapUsd: policy.spendCapUsd,
  });
}

function evaluateEstimateDrift(state, policy, { currentSpendUsd, projectedSpendUsd, actualProjectedSpendUsd }) {
  if (state.actualUsd === null || actualProjectedSpendUsd === null) {
    return;
  }

  const driftUsd = roundUsd(state.actualUsd - state.estimateUsd);
  if (driftUsd <= policy.driftToleranceUsd) {
    return;
  }

  const crossedHardAfterActual =
    policy.hardLimitUsd !== null &&
    projectedSpendUsd <= policy.hardLimitUsd &&
    actualProjectedSpendUsd > policy.hardLimitUsd;
  if (!crossedHardAfterActual) {
    return;
  }

  state.driftPolicies.push(policy);
  state.obligations.push({
    kind: "spend.reconcile-estimate-drift",
    policyId: policy.id,
    scope: policy.scope,
    estimatedCostUsd: state.estimateUsd,
    actualCostUsd: state.actualUsd,
    driftUsd,
    currentSpendUsd,
    estimatedProjectedSpendUsd: projectedSpendUsd,
    actualProjectedSpendUsd,
  });
  state.events.push(
    createSpendEvent({
      type: "spend.EstimateDriftObserved",
      request: state.request,
      meteringView: state.meteringView,
      policy,
      currentSpendUsd,
      projectedSpendUsd,
      extra: {
        estimatedCostUsd: state.estimateUsd,
        actualCostUsd: state.actualUsd,
        driftUsd,
        actualProjectedSpendUsd,
        requiresReconciliation: true,
      },
    }),
  );
}

function maybeAddCompensationObligation(state) {
  const partial = state.request.context.partialProvisioning;
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
    return;
  }
  const sagaId = optionalString(partial.sagaId);
  const provisionedResourceIds = parseOptionalStringArray(partial.provisionedResourceIds ?? []);
  if (!sagaId || provisionedResourceIds.length === 0) {
    return;
  }
  if (state.obligations.some((obligation) => obligation.kind === "deployment.compensate")) {
    return;
  }
  state.obligations.push({
    kind: "deployment.compensate",
    reason: "hard budget deny after partial provisioning",
    sagaId,
    provisionedResourceIds,
  });
}

function chooseEffect(state) {
  if (state.stalePolicies.length > 0 || state.hardViolations.length > 0 || state.approvalDenied.length > 0) {
    return "deny";
  }
  if (state.approvalNeeded.length > 0 || state.driftPolicies.length > 0) {
    return "require-approval";
  }
  return "allow";
}

function chooseReason(state) {
  if (state.stalePolicies.length > 0) {
    return "out-of-order MeteringView update failed closed";
  }
  if (state.hardViolations.length > 0) {
    return "hard budget threshold exceeded";
  }
  if (state.approvalDenied.length > 0) {
    return "approval denied for agent spendCapUsd";
  }
  if (state.approvalNeeded.length > 0) {
    return "agent spendCapUsd requires approval";
  }
  if (state.driftPolicies.length > 0) {
    return "estimate-vs-actual drift requires reconciliation approval";
  }
  return "budget and quota gate passed";
}

function createAuditedPolicyEvent({
  request,
  decision,
  meteringView,
  estimateUsd,
  actualUsd,
  actorId,
  approverId,
  policyIds,
}) {
  return {
    ...createPolicyDecidedEvent({
      request,
      decision,
      id: `policy-decided-${shortHash({ requestHash: request.inputHash, decision })}`,
    }),
    seq: meteringView.seq,
    meteringViewDigest: meteringView.digest,
    audit: {
      actorId,
      approverId,
      meteringViewSeq: meteringView.seq,
      meteringViewDigest: meteringView.digest,
      estimatedCostUsd: estimateUsd,
      actualCostUsd: actualUsd,
      policyIds,
    },
  };
}

function createSpendEvent({ type, request, meteringView, policy, currentSpendUsd, projectedSpendUsd, extra = {} }) {
  const payload = {
    type,
    schemaVersion: BUDGET_QUOTA_POLICY_SCHEMA_VERSION,
    seq: meteringView.seq,
    meteringViewDigest: meteringView.digest,
    policyId: policy.id,
    scopeKind: policy.scope.kind,
    scopeId: policy.scope.id,
    requestHash: request.inputHash,
    currentSpendUsd,
    projectedSpendUsd,
    currency: meteringView.currency,
    ...extra,
  };

  return {
    id: `${type}:${shortHash(payload)}`,
    ...payload,
  };
}

function normalizePolicies(policies) {
  if (!Array.isArray(policies)) {
    throw new TypeError("input.policies must be an array");
  }
  return policies.map((policy, index) => normalizePolicy(policy, `input.policies[${index}]`));
}

function normalizePolicy(input, path) {
  const policy = expectObject(input, path);
  const normalized = {
    id: requireString(policy.id, `${path}.id`),
    scope: normalizeScope(policy.scope, `${path}.scope`),
    softLimitUsd: optionalNonNegativeNumber(policy.softLimitUsd, `${path}.softLimitUsd`),
    hardLimitUsd: optionalNonNegativeNumber(policy.hardLimitUsd, `${path}.hardLimitUsd`),
    spendCapUsd: optionalNonNegativeNumber(policy.spendCapUsd, `${path}.spendCapUsd`),
    driftToleranceUsd: optionalNonNegativeNumber(policy.driftToleranceUsd, `${path}.driftToleranceUsd`) ?? 0,
    allowedApprovers: parseStringArray(policy.allowedApprovers ?? [], `${path}.allowedApprovers`),
    lastEvaluatedSeq: optionalNonNegativeInteger(policy.lastEvaluatedSeq, `${path}.lastEvaluatedSeq`) ?? 0,
  };

  if (
    normalized.softLimitUsd === null &&
    normalized.hardLimitUsd === null &&
    normalized.spendCapUsd === null
  ) {
    throw new TypeError(`${path} must define a softLimitUsd, hardLimitUsd, or spendCapUsd`);
  }
  if (
    normalized.softLimitUsd !== null &&
    normalized.hardLimitUsd !== null &&
    normalized.softLimitUsd >= normalized.hardLimitUsd
  ) {
    throw new RangeError(`${path}.softLimitUsd must be less than hardLimitUsd`);
  }
  return normalized;
}

function normalizeScope(input, path) {
  const scope = expectObject(input, path);
  const kind = requireString(scope.kind, `${path}.kind`);
  if (!SCOPE_KINDS.has(kind)) {
    throw new TypeError(`${path}.kind must be one of ${[...SCOPE_KINDS].join(", ")}`);
  }
  return {
    kind,
    id: requireString(scope.id, `${path}.id`),
  };
}

function normalizeMeteringView(input) {
  const view = expectObject(input, "input.meteringView");
  if (view.view !== "MeteringView") {
    throw new TypeError("input.meteringView must be a MeteringView snapshot");
  }
  return {
    ...view,
    seq: requireNonNegativeInteger(view.seq, "input.meteringView.seq"),
    currency: requireString(view.currency, "input.meteringView.currency"),
    digest: requireString(view.digest, "input.meteringView.digest"),
    totalCost: optionalNonNegativeNumber(view.totalCost, "input.meteringView.totalCost") ?? 0,
  };
}

function normalizeApproval(input) {
  if (input === undefined || input === null) {
    return null;
  }
  const approval = expectObject(input, "input.approval");
  const decision = requireString(approval.decision, "input.approval.decision");
  if (!APPROVAL_DECISIONS.has(decision)) {
    throw new TypeError("input.approval.decision must be approved or denied");
  }
  return {
    decision,
    approverId: requireString(approval.approverId, "input.approval.approverId"),
    approvedAt: requireString(approval.approvedAt, "input.approval.approvedAt"),
  };
}

function readScopeSpend(meteringView, scope) {
  const key = `${scope.kind}:${scope.id}`;
  const direct = readCounterValue(meteringView.scopeCosts?.[key]);
  if (direct !== null) {
    return direct;
  }
  const spendByScope = readCounterValue(meteringView.spendByScope?.[key]);
  if (spendByScope !== null) {
    return spendByScope;
  }
  const scopeSpendUsd = readCounterValue(meteringView.scopeSpendUsd?.[key]);
  if (scopeSpendUsd !== null) {
    return scopeSpendUsd;
  }
  if (singlePrincipalScopeMatches(meteringView, scope)) {
    return meteringView.totalCost;
  }
  return 0;
}

function readCounterValue(input) {
  if (input === undefined || input === null) {
    return null;
  }
  if (Number.isFinite(input) && input >= 0) {
    return roundUsd(input);
  }
  if (typeof input === "object" && !Array.isArray(input)) {
    for (const key of ["cost", "costUsd", "spendUsd", "value"]) {
      if (Number.isFinite(input[key]) && input[key] >= 0) {
        return roundUsd(input[key]);
      }
    }
  }
  throw new TypeError("metering scope counter must be a non-negative USD number");
}

function singlePrincipalScopeMatches(meteringView, scope) {
  const hierarchyKey =
    scope.kind === "tenant" ? "tenants" : scope.kind === "camp" ? "camps" : "agents";
  const values = meteringView.principalHierarchy?.[hierarchyKey];
  return Array.isArray(values) && values.length === 1 && values[0] === scope.id;
}

function readCost(context, ...keys) {
  const value = keys.map((key) => context?.[key]).find((candidate) => candidate !== undefined);
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`request.context.${keys[0]} must be a non-negative number`);
  }
  return roundUsd(value);
}

function readOptionalCost(context, key) {
  if (context?.[key] === undefined || context?.[key] === null) {
    return null;
  }
  if (!Number.isFinite(context[key]) || context[key] < 0) {
    throw new TypeError(`request.context.${key} must be a non-negative number`);
  }
  return roundUsd(context[key]);
}

function readActorId(request) {
  if (typeof request.context.actorId === "string" && request.context.actorId.length > 0) {
    return request.context.actorId;
  }
  if (typeof request.subject.delegatedBy === "string") {
    return request.subject.delegatedBy;
  }
  if (request.subject.delegatedBy && typeof request.subject.delegatedBy === "object") {
    return `${request.subject.delegatedBy.kind}:${request.subject.delegatedBy.id}`;
  }
  return request.subject.id;
}

function expectObject(input, fieldName) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
  return input;
}

function requireString(input, fieldName) {
  if (typeof input !== "string" || input.length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
  return input;
}

function optionalString(input) {
  if (input === undefined || input === null) {
    return null;
  }
  if (typeof input !== "string" || input.length === 0) {
    return null;
  }
  return input;
}

function parseStringArray(input, fieldName) {
  if (!Array.isArray(input)) {
    throw new TypeError(`${fieldName} must be an array`);
  }
  return input.map((value, index) => requireString(value, `${fieldName}[${index}]`));
}

function parseOptionalStringArray(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.filter((value) => typeof value === "string" && value.length > 0);
}

function optionalNonNegativeNumber(input, fieldName) {
  if (input === undefined || input === null) {
    return null;
  }
  if (!Number.isFinite(input) || input < 0) {
    throw new TypeError(`${fieldName} must be a non-negative number`);
  }
  return roundUsd(input);
}

function optionalNonNegativeInteger(input, fieldName) {
  if (input === undefined || input === null) {
    return null;
  }
  return requireNonNegativeInteger(input, fieldName);
}

function requireNonNegativeInteger(input, fieldName) {
  if (!Number.isInteger(input) || input < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer`);
  }
  return input;
}

function roundUsd(value) {
  return Number(value.toFixed(12));
}

function shortHash(input) {
  return createHash("sha256").update(canonicalJson(input)).digest("hex").slice(0, 16);
}
