# Plan 16 — Cost & FinOps

> Part of the [HoBo Design Plan Suite](./README.md). Multi-provider only pays off if HoBo can reason about cost — otherwise "ship anywhere" quietly becomes "overpay everywhere."

> **Matching by environment type (Humanitec parity):** **Matching by environment type** ([Plan 25](./25-resource-definitions-matching.md)/[Plan 26](./26-environments-deltas.md)) is a primary cost lever — platform engineers map cheap variants (in-cluster DB, scale-to-zero wasm, shared cluster) to `ephemeral`/`development` and managed-HA to `production`, so previews are cheap by construction.

> **Contracts & policy (gates):** the **cost estimate is a gate dimension** in the Gatekeeper ([Plan 29](./29-contracts-compatibility.md)) — a policy ([Plan 30](./30-policy-plane.md)) can deny over-budget plans or *allow with an obligation* ("within budget X", "require approval above $Y"), with the decision recorded as an event.

> **Runtime cost integration.** Wasm components' tiny footprint + ms cold starts ([Plan 20](./20-wasm-wasi-runtime.md)) change the cost model (higher density, scale-to-zero friendliness) — a Planner input alongside the `cost.json` signals below. AI auto-evolution can also optimize for cost as an objective ([Plan 23](./23-stubbable-ai-implementations.md)).

## Cost is a first-class input, not a report
HoBo treats cost as a signal that flows through planning, deployment, runtime, and governance:
- **Plan-time estimate** — `hobo plan` returns a projected cost for the DeploymentPlan before anything is provisioned (the agent/dev sees the bill first).
- **Provider selection** — when multiple providers fully satisfy a port, the Planner can optimize for cost (or latency, or "stay on one provider") per a tenant objective ([Plan 3](./03-providers-iac.md)).
- **Runtime observability** — live cost/egress annotations on the topology graph and run inspector ([Plan 14](./14-observability.md)).
- **Governance** — budgets + spend caps as policy gates, including for agents ([Plan 6](./06-ai-native-agent-auth.md)).

## Cost signals (`cost.json` in Capability Manifest)
Each provider publishes machine-readable price/region signals as part of its Capability Manifest ([Plan 6](./06-ai-native-agent-auth.md)):
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
- Objective is configurable per Yard/Camp: `cost` | `latency` | `single-provider` | `carbon`, **default = min-cost within constraints** ([ADR-0033](./adr/05-config-matching-environments.md#adr-0033), resolves ADR-P4). It is the **soft tiebreak** in the deterministic Matching rank (specificity → explicit `priority` → objective → stable tiebreak, [Plan 25](./25-resource-definitions-matching.md)) — applied lexicographically, not as an on-path solver; a weighted multi-objective blend is a deferred hook. The chosen rationale is recorded in `match.Decided` + on `deployment.Planned` (auditable "why this provider").
- Cross-cloud hops are penalized by their egress cost so the Planner naturally colocates bound resources unless explicitly told otherwise.

## Budgets, caps & guardrails
- **Camp/tenant budgets** — soft (alert) and hard (block deploys that would exceed) thresholds; breaches raise alerts and can require human approval.
- **Agent spend caps** — `agent({ policy: { spendCapUsd } })` bounds what an autonomous agent can provision; exceeding it triggers a policy gate (approve/deny) rather than silent spend ([Plan 6](./06-ai-native-agent-auth.md)).
- All budget/cap decisions are events → the audit trail shows who approved which spend.

## Metering, quota & showback — cost attribution ([ADR-0039](./adr/04-governance-verification.md#adr-0039))
Cost attribution + quota safety reuse the event log + policy plane rather than adding a separate system. HoBo charges no money and ships no billing ([ADR-0064](./adr/08-scope-and-requirements.md#adr-0064)) — this is FinOps (visibility + safety), not billing.
- **Metering = an event-sourced projection.** A **`MeteringView`** folds **usage/cost counters** from the log HoBo already keeps (`deployment.*`, `run.*`, `resource.*`, `forge.*`, `token.*`, egress) across a small dimension set — **control-plane operations · runtime-compute-seconds · storage-GB · egress-GB · Forge-runs**. No new instrumentation; auditable, replayable, rebuildable from zero ([Plan 11](./11-event-model.md)) so **every cost figure traces to facts**.
- **Quotas + runaway-spend circuit-breaker run through the policy plane** ([Plan 30](./30-policy-plane.md)). A counter crossing a threshold → `policy.Decided`: **soft** = warn/alert obligation; **hard** = deny at the gate (block deploy / agent provisioning / Forge run). Excess spend **velocity** trips a **durable spend circuit-breaker** — a saga obligation reusing the resilience-breaker pattern ([Plan 5](./05-reliability-ha.md)) — halting spend-incurring actions until acknowledged (`spend.CircuitTripped`/`spend.CircuitReset`). **Agent spend-caps** (above, [Plan 6](./06-ai-native-agent-auth.md)) generalize to **tenant / Camp** quotas.
- **Showback (visibility, not money).** Cost is attributed **tenant → Camp → Bindle → run/agent/team** (from the owning principal on every event) and surfaced as **showback** — OSS-core and self-hostable like the rest of the platform.

```mermaid
flowchart LR
  LOG[("event log<br/>deployment.* / run.* / resource.* / forge.* / token.* / egress")] --> MV["MeteringView projection<br/>(usage/cost counters; auditable, rebuildable)"]
  MV --> SHOW["showback: cost by tenant -> Camp -> Bindle -> run/agent/team"]
  MV --> QUOTA{"quota check (policy plane, Plan 30)"}
  QUOTA -->|soft| WARN["warn / alert obligation"]
  QUOTA -->|hard| DENY["deny at gate (block deploy / agent / Forge)"]
  MV --> VEL{"spend velocity"}
  VEL -->|runaway| CB["spend.CircuitTripped (saga, Plan 5)<br/>halt spend-incurring actions"]
  CB -->|ack| RESET["spend.CircuitReset"]
```

## Cost-driven graceful degradation & availability ([ADR-0066](./adr/04-governance-verification.md#adr-0066))
Cost is also an **availability lever**: cost controls **shed quality-of-service gracefully** before they ever hard-stop, and provisioning optimizes cost **within** an availability floor — *"hold 99.9% within $5k,"* not "pick one."
- **`costAvailabilityProfile` per Camp/Bindle.** A declarative profile binds a **budget** to an **`availabilitySlo`** ([ADR-0045](./adr/04-governance-verification.md#adr-0045)) with **ordered degradation tiers** (`nominal`→`reduced`→`minimal`, each capping a budget fraction + an SLO + what it sheds). Resources/handlers carry a **`priority`/criticality** label (`critical`|`standard`|`low`); tiers shed lowest-priority load first (`strategy: shed-low-priority-first | degrade-all | fail-closed`).
- **Spend velocity is a policy input.** The `MeteringView`'s real-time **spend velocity** feeds the policy plane ([Plan 30](./30-policy-plane.md)) — a decision asks *"at this velocity, do we cross tier N before period end?"* and yields `allow` · **`allow-degraded`** + obligation · `deny`/`fail-closed`.
- **Graceful degradation is a durable saga, not a halt.** Crossing a tier emits **`spend.DegradationRequired`**; the **SRE operator** ([Plan 40](./40-operator-agents.md)) + runtime enforce it by composing existing levers — **scale-to-zero** non-critical workloads (wasm economics, below), **feature-flag shed** ([Plan 37](./37-feature-flags-progressive-delivery.md)), **cache-TTL increase / expensive-query shed**, **request-priority shedding** (an honest `503` + `Retry-After` to low-priority callers, never a silent hang), and **canary hold**. Recovery emits **`spend.DegradationRolledBack`** (`spend.DegradationApplied` records each enforced step). The **runaway-spend circuit-breaker becomes the last resort** *after* graceful tiers are exhausted ([ADR-0039](./adr/04-governance-verification.md#adr-0039)) — degradation is the path *to* it, not a synonym for it.
- **SLO-bounded Planner objective.** The Planner objective ([ADR-0033](./adr/05-config-matching-environments.md#adr-0033)) becomes *"minimize cost **subject to** the availability floor"* — the cheapest realization that still meets `availabilitySlo`, not unbounded min-cost; the cost **and** the SLO rationale are recorded in `match.Decided`/`deployment.Planned`. Cost-induced degradation is a first-class **incident class** ([Plan 44](./44-sre-incident-management.md)): the SRE operator may *propose* cost-efficient remediation as a gated obligation, and postmortem-by-replay shows exactly what was shed.

## Optional dimensions
- **Carbon/sustainability** — providers may publish region carbon intensity alongside cost; the Planner objective can include a carbon term.
- **Commitment optimization** — surface savings-plan/reserved-capacity opportunities from observed steady-state usage (advisory, never auto-purchased without approval).

## Runtime cost inputs (integrated)
- **Wasm economics.** Ms cold starts + tiny footprint enable higher instance **density** and **scale-to-zero**, materially changing per-workload cost — a Planner input alongside the `cost.json` signals above. The OCI-container fallback keeps the existing per-resource pricing ([Plan 20](./20-wasm-wasi-runtime.md)).
- **Cross-link egress.** `link.Called` paths that cross providers/regions feed the egress term of the cost model exactly like `bind` edges ([Plan 13](./13-networking-connectivity.md)).
- **AI cost optimization.** Auto-evolution can take **cost** as an objective, proposing cheaper implementations/providers validated against recorded traces before a gated promotion ([Plan 23](./23-stubbable-ai-implementations.md)).

## Iteration hooks
- Estimate fidelity vs simplicity (static `cost.json` vs live pricing APIs vs learned usage profiles).
- ~~The default Planner objective~~ — **decided ([ADR-0033](./adr/05-config-matching-environments.md#adr-0033)):** min-cost within constraints, configurable; weighted multi-objective blending remains the open part.
- How aggressively to act on commitment/savings recommendations.
- Reconciling estimates with real provider cost (which clouds expose usable cost APIs?).
