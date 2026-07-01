# ADR: Standards-first FinOps routing control plane

Status: Accepted for draft proof

## Context

HoBo already has strong FinOps proof slices: `cost.json` estimates, MeteringView,
CreditLedgerView, budget/quota policy, cost-routing eligibility, showback,
shared-cost attribution, cost-driven degradation, and runaway-spend protection.
The missing shape is a public, provider-neutral control-plane contract that joins
those signals into an explainable routing decision.

The aggregated design critique rejected a naive "budget router plus weighted
score" because arbitrary metrics, weighted scalar optimization, and uncontrolled
feedback loops would create unstable, opaque decisions.

## Decision

The proof models the router as a standards-first, multi-stage decision system:

```text
ResourceIntent -> CandidateGeneration -> ConstraintFilter -> PolicyDecision
-> MetricVector -> ParetoFrontier -> PreferenceSelection -> StabilityDecision
-> DecisionGraph -> RoutingDecision -> ActionPlan -> ExecutionAdapter
-> FeedbackLoop
```

The core contract is provider-neutral. Concrete providers, SKUs, regions,
accounts, stacks, and backend APIs are rejected before routing, and execution
adapters translate only backend-neutral `ActionPlan` instructions.

Metrics use three tiers: immutable system metrics, approved derived metrics, and
approval-gated user metrics that only compose prior tiers. Routing is
constraint-first, then policy-gated, then Pareto-based. Preference weights only
select within the Pareto frontier. A stability controller can block churn. Every
decision emits a `DecisionGraph` consumed by DX, OpsX, and FinX views.

## Consequences

- The proof stays buildable with current open standards and HoBo draft package
  rules.
- The router is explainable and deterministic under replay.
- Feedback can propose metric or policy evolution, but cannot mutate it directly.
- Backend adapters remain mocked because production provider execution is out of
  scope for this proof.
