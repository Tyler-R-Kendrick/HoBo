# Plan 16 — Cost & FinOps

> Part of the [HoBo Design Plan Suite](./README.md). Multi-provider only pays off if HoBo can reason about cost — otherwise "ship anywhere" quietly becomes "overpay everywhere."

> **v2 update.** Wasm components' tiny footprint + ms cold starts ([Plan 20](./20-wasm-wasi-runtime.md)) change the cost model (higher density, scale-to-zero friendliness) — a Planner input alongside the `cost.json` signals below. AI auto-evolution can also optimize for cost as an objective ([Plan 23](./23-stubbable-ai-implementations.md)).

## Cost is a first-class input, not a report
HoBo treats cost as a signal that flows through planning, deployment, runtime, and governance:
- **Plan-time estimate** — `hobo plan` returns a projected cost for the DeploymentPlan before anything is provisioned (the agent/dev sees the bill first).
- **Provider selection** — when multiple providers fully satisfy a port, the Planner can optimize for cost (or latency, or "stay on one provider") per a tenant objective ([Plan 3](./03-providers-iac.md)).
- **Runtime observability** — live cost/egress annotations on the topology graph and run inspector ([Plan 14](./14-observability.md)).
- **Governance** — budgets + spend caps as policy gates, including for agents ([Plan 6](./06-ai-native-agent-auth.md)).

## Cost signals (`cost.json` in Hobo Code)
Each provider publishes machine-readable price/region signals as part of its Hobo Code ([Plan 6](./06-ai-native-agent-auth.md)):
```jsonc
{
  "currency": "USD",
  "unitPrices": {
    "compute.container.vcpu_hour": 0.04,
    "compute.container.gb_hour": 0.004,
    "database.pg.flex.instance_hour": { "small": 0.06, "medium": 0.12 },
    "objectStore.gb_month": 0.021,
    "egress.gb": { "same_region": 0.0, "cross_region": 0.02, "internet": 0.09 }
  },
  "freeTier": { "objectStore.gb_month": 5 },
  "regions": ["us-east","eu-west"]
}
```
These are estimates (real bills vary); HoBo reconciles estimates against actual provider billing where an API exists, and records the delta.

## The Planner cost model
- For a candidate plan, sum each resource's projected cost from `cost.json` × an expected-usage profile (defaults per port, overridable in the Bindle), plus **egress** across each `bind` edge given its connectivity tier ([Plan 13](./13-networking-connectivity.md)).
- Objective is configurable per tenant: `min-cost`, `min-latency`, `min-cross-cloud`, or a weighted blend; the chosen rationale is recorded on `deployment.Planned` (auditable "why this provider").
- Cross-cloud hops are penalized by their egress cost so the Planner naturally colocates bound resources unless explicitly told otherwise.

## Budgets, caps & guardrails
- **Camp/tenant budgets** — soft (alert) and hard (block deploys that would exceed) thresholds; breaches raise alerts and can require human approval.
- **Agent spend caps** — `agent({ policy: { spendCapUsd } })` bounds what an autonomous agent can provision; exceeding it triggers a policy gate (approve/deny) rather than silent spend ([Plan 6](./06-ai-native-agent-auth.md)).
- All budget/cap decisions are events → the audit trail shows who approved which spend.

## Showback / chargeback
- Cost is attributable per tenant/Bindle/Camp/resource because every provisioning + usage fact is in the event log with the owning principal.
- The dashboard provides showback by default; chargeback (billing integration) is a hosted-tier feature.

## Optional dimensions
- **Carbon/sustainability** — providers may publish region carbon intensity alongside cost; the Planner objective can include a carbon term.
- **Commitment optimization** — surface savings-plan/reserved-capacity opportunities from observed steady-state usage (advisory, never auto-purchased without approval).

## Iteration hooks
- Estimate fidelity vs simplicity (static `cost.json` vs live pricing APIs vs learned usage profiles).
- The default Planner objective (cost-first feels right for the agnostic promise, but latency-sensitive apps differ).
- How aggressively to act on commitment/savings recommendations.
- Reconciling estimates with real billing per provider (which expose usable billing APIs?).
