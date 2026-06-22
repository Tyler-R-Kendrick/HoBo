# ADR-0039 — Metering, quota & cost attribution

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product, SRE
- **Related:** [Plan 16 — Cost/FinOps](../16-cost-finops.md) (budgets, spend-caps) · [Plan 30 — Policy plane](../30-policy-plane.md) (quota gates + obligations) · [Plan 5 — Reliability/HA](../05-reliability-ha.md) (circuit-breaker pattern) · [Plan 6](../06-ai-native-agent-auth.md) (agent spend-caps) · [Plan 11 — Event model](../11-event-model.md) (projections, events) · [Plan 12](../12-security-multitenancy.md) (per-tenant isolation) · [ADR-0064 — Scope: AI-native meta-cloud](./ADR-0064-scope-ai-native-meta-cloud.md)
- **Origin:** the platform needs to **attribute cloud cost**, enforce **quotas**, and guard against **runaway spend** — independent of any commercial model. Money-movement (billing/invoicing/chargeback) is out of scope ([ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md)); this ADR is **FinOps / cost-safety**, not billing. Designed via brainstorming + grill-with-docs.

## Context
[Plan 16](../16-cost-finops.md) already has plan-time cost estimation, soft/hard **budgets**, **agent spend-caps**, and a **provider-resilience circuit-breaker** — but it had no **metering** model (what's measurable + how), no **quota** enforcement beyond budget alerts, no **runaway-spend** safeguard, and no **cost-attribution / showback** pipeline. Without these the platform can't attribute spend or protect tenants from runaway cost. HoBo charges no money and ships no billing ([ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md)); this is purely cost visibility + safety.

## Decision
1. **Metering is an event-sourced projection.** A **`MeteringView`** folds **usage/cost counters** from the event log HoBo already keeps — `deployment.*`, `run.*`, `resource.*`, `forge.*`, `token.*`, and egress ([Plan 13](../13-networking-connectivity.md)/[Plan 16](../16-cost-finops.md)) — across a small dimension set: **control-plane operations, runtime-compute-seconds, storage-GB, egress-GB, and Forge-runs**. No new instrumentation; the view is auditable, replayable, and rebuildable from zero like every projection ([Plan 11](../11-event-model.md)), so **every cost figure traces to facts**.
2. **Quotas + a runaway-spend circuit-breaker run through the policy plane.** A metered counter crossing a threshold produces a **`policy.Decided`** ([Plan 30](../30-policy-plane.md)): **soft** → warn/alert obligation; **hard** → **deny at the gate** (block the spend-incurring action — deploy / agent provisioning / Forge run). Excess **spend *velocity*** trips a **durable spend circuit-breaker** — a saga obligation reusing the breaker pattern from [Plan 5](../05-reliability-ha.md) — that **halts spend-incurring actions until acknowledged/reset**. The existing **agent spend-caps** ([Plan 6](../06-ai-native-agent-auth.md)/[Plan 16](../16-cost-finops.md)) generalize to **tenant / Camp** quotas.
3. **Showback (cost attribution, not money).** Cost is attributed by the dimensions already in the event envelope — **tenant → Camp → Bindle → run/agent/team** — and surfaced as **showback** (visibility). It is OSS-core and self-hostable like the rest of the platform; there is no chargeback/invoicing.
4. **Events:** `spend.CircuitTripped` · `spend.CircuitReset`. **Quota decisions ride the existing `policy.Decided`**; metering itself is a projection (no per-usage events).

## Alternatives considered
- **A separate metering pipeline (independent instrumentation).** Rejected: duplicates what the log records and risks drift between "what happened" and "what was metered"; the projection is the source-of-truth-consistent answer.
- **A bespoke quota subsystem** separate from the policy plane. Rejected: duplicates the decision model + gates and splits "why was this blocked" across two systems.
- **Soft alerts only (no hard enforcement).** Rejected: no protection against runaway spend (a looping agent racking up cost).

## Consequences
- **(+)** The platform can meter, quota, protect against runaway spend, and attribute cost — all from the existing log + policy plane, with auditable figures.
- **(+)** Reuses the event log/projection model ([Plan 11](../11-event-model.md)), the policy plane + obligations ([Plan 30](../30-policy-plane.md)), the circuit-breaker pattern ([Plan 5](../05-reliability-ha.md)), and agent spend-caps ([Plan 6](../06-ai-native-agent-auth.md)) — little new machinery (a projection + two events).
- **(−)** Metering fidelity depends on the cost-dimension model; mapping raw events → fair, intuitive counters is ongoing work.
- **(−)** A spend circuit-breaker that halts actions is a sharp safeguard: tuning its velocity thresholds to avoid false trips (vs missing real runaways) is an iteration hook.
