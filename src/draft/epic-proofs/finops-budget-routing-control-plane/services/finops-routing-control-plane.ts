const EPIC = Object.freeze({
  id: "post-core-finops-control-plane",
  title: "Standards-first FinOps Budget Routing Control Plane",
  slug: "finops-budget-routing-control-plane",
});

const CONTRACTS_COVERED = Object.freeze([
  "MetricContractRegistry",
  "ConstraintEngine",
  "ParetoEvaluator",
  "StabilityController",
  "DecisionGraphPublisher",
  "FeedbackProposalGate",
  "SimulationRunner",
]);

const STANDARD_BASELINES = Object.freeze([
  { name: "FOCUS", version: "1.4", role: "normalized actual-cost ledger" },
  { name: "FinOps Framework", version: "current", role: "budget, forecast, allocation vocabulary" },
  { name: "CloudEvents", version: "1.0.x", role: "lifecycle, cost, usage, audit envelopes" },
  { name: "CDEvents", version: "0.5.x", role: "delivery lifecycle semantics" },
  { name: "OpenTelemetry", version: "1.58.0", role: "trace, metric, log correlation" },
  { name: "OpenAPI", version: "3.2.0", role: "synchronous public API view" },
  { name: "AsyncAPI", version: "3.1.0", role: "event-channel API view" },
  { name: "JSON Schema", version: "2020-12", role: "generated public schema view" },
  { name: "CEL", version: "current", role: "default embedded policy expression" },
  { name: "OPA/Rego", version: "current", role: "policy-engine adapter" },
]);

const FORBIDDEN_CORE_KEYS = new Set([
  "provider",
  "providerId",
  "cloud",
  "sku",
  "skuId",
  "region",
  "account",
  "accountId",
  "subscriptionId",
  "billingAccountId",
  "backend",
  "backendApi",
  "stack",
]);

const FORBIDDEN_CORE_VALUE = /\b(aws|azure|gcp|us-east-[0-9]|eastus|terraform apply|pulumi up)\b/iu;
const APPROVED_DERIVED_TRANSFORMS = new Set(["windowed_avg", "p95", "weighted_time_decay", "weighted_sum", "ratio"]);
const NOW = "2026-07-01T16:00:00.000Z";

export async function runFinopsRoutingControlPlaneSimulation() {
  const approvedRoute = evaluateRoutingScenario({
    id: "approved-route",
    intent: baseIntent(),
    candidates: candidateFixture(),
    metricContracts: metricContractsFixture(),
    history: [],
    budgetState: { spendToDate: 700 },
  });
  const approvalRequired = evaluateRoutingScenario({
    id: "approval-required",
    intent: {
      ...baseIntent(),
      budget: {
        ...baseIntent().budget,
        amount: 3_200,
        softLimitBehavior: "requireApproval",
      },
    },
    candidates: candidateFixture(),
    metricContracts: metricContractsFixture(),
    history: [],
    budgetState: { spendToDate: 900 },
  });
  const budgetDeny = evaluateRoutingScenario({
    id: "budget-deny",
    intent: {
      ...baseIntent(),
      budget: {
        ...baseIntent().budget,
        amount: 2_000,
        hardLimitBehavior: "deny",
      },
      constraints: {
        ...baseIntent().constraints,
        maxCost: 1_900,
      },
    },
    candidates: candidateFixture(),
    metricContracts: metricContractsFixture(),
    history: [],
    budgetState: { spendToDate: 1_900 },
  });
  const stabilityCooldown = evaluateRoutingScenario({
    id: "stability-cooldown",
    intent: baseIntent(),
    candidates: candidateFixture(),
    metricContracts: metricContractsFixture(),
    history: [
      {
        candidateId: "candidate-economy",
        score: 0.7485,
        decidedAt: "2026-07-01T08:00:00.000Z",
      },
    ],
    budgetState: { spendToDate: 700 },
  });
  const invalidMetricContracts = parseMetricContracts(invalidMetricContractsFixture());
  const providerLeakage = parseResourceIntent(providerLeakingIntent());
  const feedbackGovernance = createFeedbackGovernance(approvedRoute, metricContractsFixture());
  const simulationPreview = createSimulationPreview(approvedRoute, stabilityCooldown);

  return {
    epic: EPIC,
    standards: [...STANDARD_BASELINES],
    verticalSlices: [
      verticalSlice("standards-first-intent-routing", "application developer", [
        "ConstraintEngine",
        "DecisionGraphPublisher",
        "SimulationRunner",
      ]),
      verticalSlice("governed-metric-routing", "platform engineer", [
        "MetricContractRegistry",
        "FeedbackProposalGate",
      ]),
      verticalSlice("constraint-first-selection", "FinOps lead", [
        "ConstraintEngine",
        "ParetoEvaluator",
        "DecisionGraphPublisher",
      ]),
      verticalSlice("stability-controlled-feedback", "SRE operator", [
        "StabilityController",
        "FeedbackProposalGate",
      ]),
    ],
    approvedRoute,
    approvalRequired,
    budgetDeny,
    stabilityCooldown,
    invalidMetricContracts,
    providerLeakage,
    feedbackGovernance,
    simulationPreview,
    experienceSurfaces: createExperienceSurfaces(approvedRoute),
    adapterFixtures: [
      adapterFixture("terraform-plan-json"),
      adapterFixture("pulumi-automation-api"),
      adapterFixture("crossplane-composition"),
      adapterFixture("kubernetes-runtime-controller"),
    ],
    contracts: {
      covered: [...CONTRACTS_COVERED],
      missing: [],
    },
  };
}

export function parseResourceIntent(raw) {
  const errors = [];
  inspectProviderLeakage(raw, "intent", errors);
  if (raw?.schemaVersion !== "hobo.finops.resource-intent/v1") {
    errors.push("intent.schemaVersion must be hobo.finops.resource-intent/v1");
  }
  if (!raw?.owner?.tenant || !raw?.owner?.workspace || !raw?.owner?.environment) {
    errors.push("intent.owner requires tenant, workspace, and environment");
  }
  if (!raw?.capability?.category) {
    errors.push("intent.capability.category is required");
  }
  if (!(raw?.budget?.amount > 0) || raw?.budget?.currency !== "USD") {
    errors.push("intent.budget requires a positive USD amount");
  }

  return errors.length > 0
    ? { ok: false, errors, intent: null }
    : { ok: true, errors: [], intent: structuredClone(raw) };
}

export function parseMetricContracts(rawContracts) {
  const errors = [];
  const parsed = [];

  for (const metric of rawContracts) {
    const prefix = `metric.${metric?.name ?? "unknown"}`;
    if (!metric?.name) errors.push(`${prefix}.name is required`);
    if (!["system", "derived", "user"].includes(metric?.tier)) {
      errors.push(`${prefix}.tier must be system, derived, or user`);
    }
    if (!/^v\d+\.\d+\.\d+$/u.test(metric?.version ?? "")) {
      errors.push(`${prefix}.version must be semantic and explicit`);
    }

    if (metric?.tier === "system") {
      if (!metric.unit) errors.push(`${prefix}.unit is required for system metrics`);
      if (!metric.source) errors.push(`${prefix}.source is required for system metrics`);
      if (!metric.normalization) errors.push(`${prefix}.normalization is required for system metrics`);
      if (metric.mutable === true) errors.push(`${prefix}.semantics must be immutable`);
    }

    if (metric?.tier === "derived") {
      if (!Array.isArray(metric.dependsOn) || metric.dependsOn.length === 0) {
        errors.push(`${prefix}.dependsOn is required for derived metrics`);
      }
      for (const transform of metric.transforms ?? []) {
        if (!APPROVED_DERIVED_TRANSFORMS.has(transform)) {
          errors.push(`${prefix}.transforms contains unapproved transform ${transform}`);
        }
      }
    }

    if (metric?.tier === "user") {
      if (metric.formula) errors.push(`${prefix}.formula is not allowed; user metrics are composition-only`);
      if (metric.requiresApproval !== true) errors.push(`${prefix}.requiresApproval must be true`);
      for (const source of metric.compositionSources ?? []) {
        if (source.startsWith("raw:") || source.startsWith("otel.")) {
          errors.push(`${prefix}.compositionSources cannot reference raw telemetry ${source}`);
        }
      }
    }

    parsed.push(structuredClone(metric));
  }

  return errors.length > 0 ? { ok: false, errors, contracts: [] } : { ok: true, errors: [], contracts: parsed };
}

export function evaluateRoutingScenario({ id, intent, candidates, metricContracts, history, budgetState }) {
  const parsedIntent = parseResourceIntent(intent);
  const parsedMetrics = parseMetricContracts(metricContracts);

  if (!parsedIntent.ok || !parsedMetrics.ok) {
    return {
      scenarioId: id,
      status: "rejected",
      parse: { intent: parsedIntent, metrics: parsedMetrics },
    };
  }

  const constraints = applyConstraints(parsedIntent.intent, candidates);
  const policy = evaluateBudgetPolicy(parsedIntent.intent, constraints.allowed, budgetState);
  const eligible = policy.candidatePolicies.filter((candidatePolicy) => candidatePolicy.effect !== "deny");
  const eligibleCandidateIds = new Set(eligible.map((candidatePolicy) => candidatePolicy.candidateId));
  const metricVectors = buildMetricVectors(
    constraints.allowed.filter((candidate) => eligibleCandidateIds.has(candidate.id)),
  );
  const pareto = buildParetoFrontier(metricVectors);
  const preference = selectFromPareto(pareto, preferenceModel());
  const stability = applyStability(preference, history, stabilityPolicy(), pareto);
  const finalCandidateId = stability.selectedCandidateId;
  const finalPolicy = policy.candidatePolicies.find((candidatePolicy) => candidatePolicy.candidateId === finalCandidateId);
  const graph = createDecisionGraph({
    scenarioId: id,
    candidates,
    constraints,
    policy,
    metricVectors,
    pareto,
    preference,
    stability,
    finalCandidateId,
  });
  const decision = createRoutingDecision(id, graph, finalPolicy, finalCandidateId, constraints, eligible);
  const actionPlan = compileActionPlan(decision);
  const events = eventLogFor(id, decision, graph, actionPlan);

  return {
    scenarioId: id,
    status: decision.effect,
    parse: { intent: parsedIntent, metrics: parsedMetrics },
    constraints,
    policy,
    metricVectors,
    pareto,
    preference,
    stability,
    decisionGraph: graph,
    routingDecision: decision,
    actionPlan,
    events,
  };
}

function applyConstraints(intent, candidates) {
  const allowed = [];
  const rejected = [];
  const results = [];

  for (const candidate of candidates) {
    const reasons = [];
    if (candidate.capabilityClass !== intent.capability.category) reasons.push("capability-mismatch");
    if (candidate.monthlyCost > intent.constraints.maxCost) reasons.push("max-cost-exceeded");
    if (!candidate.compliance.includes(intent.capability.requirements.compliance)) reasons.push("compliance-missing");
    if (!intent.constraints.allowedJurisdictions.includes(candidate.jurisdiction)) reasons.push("jurisdiction-not-allowed");
    if (candidate.securityLevel < intent.constraints.minSecurityLevel) reasons.push("security-level-too-low");
    if (!candidate.eligible) reasons.push("cost-routing-ineligible");

    const result = {
      candidateId: candidate.id,
      passed: reasons.length === 0,
      reasons,
    };
    results.push(result);
    if (result.passed) {
      allowed.push(candidate);
    } else {
      rejected.push({ candidateId: candidate.id, reasons });
    }
  }

  return { allowed, rejected, results };
}

function evaluateBudgetPolicy(intent, candidates, budgetState) {
  const candidatePolicies = candidates.map((candidate) => {
    const projectedCost = budgetState.spendToDate + candidate.monthlyCost;
    if (projectedCost > intent.budget.amount && intent.budget.hardLimitBehavior === "deny") {
      return policyResult(candidate.id, "deny", "hard-budget-limit");
    }
    if (projectedCost > intent.budget.amount) {
      return policyResult(candidate.id, "requireApproval", "budget-forecast-over-limit");
    }
    if (projectedCost > intent.budget.amount * 0.8 && intent.budget.softLimitBehavior === "requireApproval") {
      return policyResult(candidate.id, "requireApproval", "soft-budget-threshold");
    }
    return policyResult(candidate.id, "allow", "within-budget");
  });

  return {
    evaluatedAt: NOW,
    candidatePolicies,
    deniedCandidateIds: candidatePolicies.filter((policy) => policy.effect === "deny").map((policy) => policy.candidateId),
    approvalCandidateIds: candidatePolicies
      .filter((policy) => policy.effect === "requireApproval")
      .map((policy) => policy.candidateId),
  };
}

function buildMetricVectors(candidates) {
  return candidates.map((candidate) => ({
    candidateId: candidate.id,
    cost: candidate.monthlyCost,
    reliability: candidate.reliability,
    latency: candidate.latencyP95Ms,
    risk: candidate.risk,
    customMetrics: {
      "experienced.reliability": round(candidate.reliability * 100 - candidate.risk * 10),
    },
  }));
}

function buildParetoFrontier(metricVectors) {
  const dominated = new Set();
  for (const candidate of metricVectors) {
    for (const challenger of metricVectors) {
      if (candidate.candidateId !== challenger.candidateId && dominates(challenger, candidate)) {
        dominated.add(candidate.candidateId);
      }
    }
  }

  return {
    candidateIds: metricVectors
      .filter((vector) => !dominated.has(vector.candidateId))
      .map((vector) => vector.candidateId),
    dominatedCandidateIds: [...dominated].sort(),
    vectors: metricVectors,
  };
}

function selectFromPareto(pareto, model) {
  const vectors = pareto.vectors.filter((vector) => pareto.candidateIds.includes(vector.candidateId));
  const costs = vectors.map((vector) => vector.cost);
  const latencies = vectors.map((vector) => vector.latency);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minLatency = Math.min(...latencies);
  const maxLatency = Math.max(...latencies);
  const scored = vectors.map((vector) => {
    const score =
      normalizedLowerIsBetter(vector.cost, minCost, maxCost) * model.costWeight +
      vector.reliability * model.reliabilityWeight +
      normalizedLowerIsBetter(vector.latency, minLatency, maxLatency) * model.latencyWeight +
      (1 - vector.risk) * model.riskWeight;
    return { candidateId: vector.candidateId, score: round(score) };
  });
  scored.sort((left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId));

  return {
    model,
    selectedCandidateId: scored[0]?.candidateId ?? null,
    selectedScore: scored[0]?.score ?? 0,
    scored,
    appliedOnlyWithinPareto: true,
  };
}

function applyStability(preference, history, policy, pareto) {
  const previous = history.at(-1);
  if (!previous || previous.candidateId === preference.selectedCandidateId) {
    return {
      selectedCandidateId: preference.selectedCandidateId,
      overridden: false,
      reason: "no-recent-placement-change",
      improvementRatio: 1,
      policy,
    };
  }

  const improvementRatio = round((preference.selectedScore - previous.score) / previous.score);
  const previousStillValid = pareto.candidateIds.includes(previous.candidateId);
  const withinCooldown = Date.parse(NOW) - Date.parse(previous.decidedAt) < hours(24);
  const flipLimited = (previous.flipsInWindow ?? 1) >= policy.flipLimitPerWindow;

  if (previousStillValid && (improvementRatio < policy.minImprovementThreshold || withinCooldown || flipLimited)) {
    return {
      selectedCandidateId: previous.candidateId,
      overridden: true,
      reason: "stability-cooldown-or-threshold",
      improvementRatio,
      policy,
    };
  }

  return {
    selectedCandidateId: preference.selectedCandidateId,
    overridden: false,
    reason: "stability-allows-change",
    improvementRatio,
    policy,
  };
}

function createDecisionGraph({
  scenarioId,
  candidates,
  constraints,
  policy,
  metricVectors,
  pareto,
  preference,
  stability,
  finalCandidateId,
}) {
  const rejectedCandidateIds = [
    ...constraints.rejected.map((candidate) => candidate.candidateId),
    ...policy.deniedCandidateIds,
  ];

  return {
    id: `decision-graph:${scenarioId}`,
    generatedCandidateIds: candidates.map((candidate) => candidate.id),
    rejectedCandidateIds,
    constraintResults: constraints.results,
    policiesTriggered: policy.candidatePolicies.filter((item) => item.effect !== "allow"),
    metricsEvaluated: {
      systemMetrics: ["cost.monthly", "reliability.uptime", "latency.p95", "risk.incident"],
      derivedMetrics: ["experienced.reliability"],
      userMetrics: ["business.quality"],
    },
    metricVectors,
    paretoSet: pareto.candidateIds,
    dominatedCandidateIds: pareto.dominatedCandidateIds,
    preferenceChoice: preference.selectedCandidateId,
    stabilityOverride: stability.overridden,
    finalSelection: finalCandidateId,
    rationale: [
      "constraint-filter-before-metrics",
      "policy-before-metric-vector",
      "pareto-frontier-before-preference",
      stability.overridden ? "stability-overrode-preference" : "stability-accepted-preference",
    ],
    auditRefs: [
      "focus-ledger@seq:42",
      "metering-view@seq:42",
      "credit-ledger@seq:42",
      "cloud-event:routing.Decided",
    ],
  };
}

function createRoutingDecision(scenarioId, graph, finalPolicy, finalCandidateId, constraints, eligible) {
  if (constraints.allowed.length === 0 || eligible.length === 0 || !finalCandidateId) {
    return {
      id: `routing-decision:${scenarioId}`,
      effect: "deny",
      selectedCandidateId: null,
      decisionGraphId: graph.id,
      reason: "no-eligible-candidates",
    };
  }

  return {
    id: `routing-decision:${scenarioId}`,
    effect: finalPolicy?.effect ?? "allow",
    selectedCandidateId: finalCandidateId,
    decisionGraphId: graph.id,
    reason: finalPolicy?.reason ?? "within-budget",
  };
}

function compileActionPlan(decision) {
  if (decision.effect === "deny") {
    return {
      id: `action-plan:${decision.id}`,
      decisionId: decision.id,
      backendNeutral: true,
      actions: [{ type: "freeze", scope: "resource-intent", targetConstraints: ["no-new-spend"] }],
      allowedActions: ["deploy", "destroy", "scale", "migrate", "pause", "freeze", "upgrade"],
    };
  }

  return {
    id: `action-plan:${decision.id}`,
    decisionId: decision.id,
    backendNeutral: true,
    actions: [
      {
        type: decision.effect === "requireApproval" ? "pause" : "migrate",
        scope: "resource-intent",
        targetConstraints: ["cost-within-budget", "reliability-gte-current", "latency-within-intent"],
      },
    ],
    allowedActions: ["deploy", "destroy", "scale", "migrate", "pause", "freeze", "upgrade"],
  };
}

function createFeedbackGovernance(route, metricContracts) {
  const before = structuredClone(metricContracts);
  const proposals = [
    {
      id: "feedback-proposal:cost-drift",
      source: "actual-cost",
      target: "cost.monthly",
      effect: "propose-metric-change",
      observed: { estimateUsd: 3_000, actualUsd: 3_420, driftRatio: 0.14 },
      decisionGraphId: route.decisionGraph.id,
    },
    {
      id: "feedback-proposal:operator-override",
      source: "override",
      target: "stability.minImprovementThreshold",
      effect: "propose-policy-review",
      observed: { reason: "incident freeze requested by SRE" },
      decisionGraphId: route.decisionGraph.id,
    },
  ];
  const metricVersionChange = {
    metricName: "cost.monthly",
    fromVersion: "v1.0.0",
    toVersion: "v1.1.0",
    approvalState: "requires-approval",
  };

  return {
    proposals,
    metricVersionChange,
    metricsMutatedDirectly: JSON.stringify(before) !== JSON.stringify(metricContracts),
    policyMutatedDirectly: false,
  };
}

function createExperienceSurfaces(route) {
  return {
    dx: {
      surface: "dry-run-preview",
      decisionGraphId: route.decisionGraph.id,
      questionsAnswered: ["why-this-placement", "what-if-budget-changes", "simulation-preview"],
    },
    opsx: {
      surface: "runtime-control",
      decisionGraphId: route.decisionGraph.id,
      safeActions: ["override", "freeze", "rollback", "migrate", "incident-reroute"],
    },
    finx: {
      surface: "financial-control",
      decisionGraphId: route.decisionGraph.id,
      views: ["budget", "forecast", "attribution", "anomaly-signal", "commitment-recommendation"],
    },
  };
}

function createSimulationPreview(approvedRoute, stabilityCooldown) {
  return {
    request: {
      id: "simulation-request:budget-drop",
      scenarios: ["budget_drop_30_percent", "incident_freeze"],
    },
    result: {
      requestId: "simulation-request:budget-drop",
      decisionGraphIds: [approvedRoute.decisionGraph.id, stabilityCooldown.decisionGraph.id],
      costTrajectory: [3_900, 3_600, 3_420],
      reliabilityTrajectory: [0.97, 0.97, 0.96],
      migrationEvents: stabilityCooldown.stability.overridden ? [] : ["migration-requested"],
      stabilityScore: stabilityCooldown.stability.overridden ? 1 : 0.64,
    },
  };
}

function eventLogFor(scenarioId, decision, graph, actionPlan) {
  return [
    event(1, "routing.CandidatesGenerated", scenarioId, { count: graph.generatedCandidateIds.length }),
    event(2, "routing.Decided", scenarioId, {
      decisionId: decision.id,
      decisionGraphId: graph.id,
      effect: decision.effect,
    }),
    event(3, "routing.ActionPlanCompiled", scenarioId, {
      actionPlanId: actionPlan.id,
      backendNeutral: actionPlan.backendNeutral,
    }),
  ];
}

function inspectProviderLeakage(value, path, errors) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectProviderLeakage(item, `${path}[${index}]`, errors));
    return;
  }
  if (typeof value === "string") {
    if (FORBIDDEN_CORE_VALUE.test(value)) {
      errors.push(`${path} contains provider, concrete region, or backend API value ${value}`);
    }
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_CORE_KEYS.has(key)) {
      errors.push(`${path}.${key} is adapter-specific and forbidden in router core inputs`);
    }
    inspectProviderLeakage(nested, `${path}.${key}`, errors);
  }
}

function dominates(left, right) {
  const atLeastAsGood =
    left.cost <= right.cost &&
    left.reliability >= right.reliability &&
    left.latency <= right.latency &&
    left.risk <= right.risk;
  const strictlyBetter =
    left.cost < right.cost ||
    left.reliability > right.reliability ||
    left.latency < right.latency ||
    left.risk < right.risk;
  return atLeastAsGood && strictlyBetter;
}

function normalizedLowerIsBetter(value, min, max) {
  if (max === min) return 1;
  return (max - value) / (max - min);
}

function policyResult(candidateId, effect, reason) {
  return { candidateId, effect, reason };
}

function preferenceModel() {
  return {
    costWeight: 0.35,
    reliabilityWeight: 0.35,
    latencyWeight: 0.2,
    riskWeight: 0.1,
  };
}

function stabilityPolicy() {
  return {
    minImprovementThreshold: 0.12,
    cooldownWindow: "24h",
    migrationPenalty: 0.05,
    flipLimitPerWindow: 2,
  };
}

function hours(value) {
  return value * 60 * 60 * 1_000;
}

function round(value) {
  return Math.round(value * 10_000) / 10_000;
}

function event(seq, type, scenarioId, data) {
  return {
    id: `evt:${scenarioId}:${seq}`,
    type,
    seq,
    time: NOW,
    source: "finops-budget-routing-control-plane",
    specversion: "1.0",
    data,
  };
}

function adapterFixture(adapter) {
  return {
    adapter,
    boundary: "ExecutionAdapterPort",
    fixtureOnly: true,
    routingLogic: false,
  };
}

function verticalSlice(id, persona, boundaries) {
  return {
    id,
    persona,
    scenario: `${persona} exercises ${id} through mocked service boundaries`,
    boundaries: boundaries.map((name) => ({ name, mocked: true })),
  };
}

function baseIntent() {
  return {
    schemaVersion: "hobo.finops.resource-intent/v1",
    owner: {
      tenant: "tenant-a",
      workspace: "payments",
      environment: "production",
    },
    capability: {
      category: "compute",
      requirements: {
        availability: "high",
        latencyP95Ms: 120,
        durability: "standard",
        compliance: "pci",
      },
    },
    budget: {
      amount: 5_000,
      currency: "USD",
      period: "monthly",
      softLimitBehavior: "requireApproval",
      hardLimitBehavior: "deny",
    },
    constraints: {
      allowedJurisdictions: ["US"],
      disallowedJurisdictions: [],
      maxCost: 4_500,
      minSecurityLevel: 4,
    },
    routing: {
      objective: "balanced",
    },
  };
}

function providerLeakingIntent() {
  return {
    ...baseIntent(),
    routing: {
      ...baseIntent().routing,
      provider: "aws",
      region: "us-east-1",
      backendApi: "terraform apply",
    },
  };
}

function candidateFixture() {
  return [
    candidate("candidate-economy", 2_200, 0.91, 160, 0.2, ["pci"], "US", 4, true),
    candidate("candidate-balanced", 3_000, 0.97, 95, 0.1, ["pci"], "US", 5, true),
    candidate("candidate-premium", 4_200, 0.985, 80, 0.16, ["pci"], "US", 5, true),
    candidate("candidate-wasteful", 3_600, 0.93, 150, 0.25, ["pci"], "US", 4, true),
    candidate("candidate-ineligible", 1_700, 0.98, 70, 0.05, ["none"], "EU", 2, false),
  ];
}

function candidate(id, monthlyCost, reliability, latencyP95Ms, risk, compliance, jurisdiction, securityLevel, eligible) {
  return {
    id,
    capabilityClass: "compute",
    monthlyCost,
    reliability,
    latencyP95Ms,
    risk,
    compliance,
    jurisdiction,
    securityLevel,
    eligible,
    abstractTraits: ["capability-match", "adapter-hidden", "budget-visible"],
  };
}

function metricContractsFixture() {
  return [
    {
      name: "cost.monthly",
      tier: "system",
      unit: "USD",
      source: "focus-ledger",
      normalization: "currency-usd",
      version: "v1.0.0",
      mutable: false,
    },
    {
      name: "reliability.uptime",
      tier: "system",
      unit: "ratio",
      source: "opentelemetry-slo",
      normalization: "global-0-1",
      version: "v1.0.0",
      mutable: false,
    },
    {
      name: "latency.p95",
      tier: "system",
      unit: "ms",
      source: "opentelemetry-metrics",
      normalization: "lower-is-better",
      version: "v1.0.0",
      mutable: false,
    },
    {
      name: "experienced.reliability",
      tier: "derived",
      version: "v1.0.0",
      dependsOn: ["reliability.uptime", "latency.p95"],
      transforms: ["weighted_sum"],
    },
    {
      name: "business.quality",
      tier: "user",
      version: "v1.0.0",
      compositionSources: ["experienced.reliability", "cost.monthly"],
      weights: { reliability: 0.7, cost: 0.3 },
      requiresApproval: true,
    },
  ];
}

function invalidMetricContractsFixture() {
  return [
    {
      name: "cost.monthly",
      tier: "system",
      source: "focus-ledger",
      normalization: "currency-usd",
      version: "v1.0.0",
    },
    {
      name: "experienced.reliability",
      tier: "derived",
      version: "v1.0.0",
      dependsOn: ["reliability.uptime"],
      transforms: ["arbitrary-js"],
    },
    {
      name: "team.happiness",
      tier: "user",
      version: "v1.0.0",
      compositionSources: ["raw:otel.request.duration"],
      formula: "eval(raw)",
      requiresApproval: false,
    },
    {
      name: "risk.incident",
      tier: "system",
      unit: "ratio",
      source: "incident-system",
      normalization: "lower-is-better",
      version: "latest",
    },
  ];
}
