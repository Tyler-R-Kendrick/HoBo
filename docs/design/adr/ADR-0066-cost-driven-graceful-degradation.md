# ADR-0066 — Availability through cost controls: cost-driven graceful degradation & SLO-aware cost/availability trade-offs

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product, SRE
- **Related:** [Plan 16 — Cost/FinOps](../16-cost-finops.md) · [Plan 5 — Reliability/HA](../05-reliability-ha.md) · [Plan 30 — Policy plane](../30-policy-plane.md) (obligations) · [Plan 37 — Feature flags](../37-feature-flags-progressive-delivery.md) · [Plan 44 — SRE/incident](../44-sre-incident-management.md) · [Plan 40 — Operator agents](../40-operator-agents.md) · [ADR-0039 — Metering/quota/cost-attribution](./ADR-0039-billing-quota-cost-attribution.md) · [ADR-0045 — SLO-as-code](./ADR-0045-slo-as-code-and-alerting.md) · [ADR-0033 — Planner selection](./ADR-0033-deterministic-matching-and-planner-selection.md)

## Context
HoBo has strong **availability** machinery ([Plan 5](../05-reliability-ha.md): leases/fencing, replication, circuit breakers, canary/auto-rollback, drift) and strong **cost** machinery ([Plan 16](../16-cost-finops.md)/[ADR-0039](./ADR-0039-billing-quota-cost-attribution.md): plan-time estimates, budgets, agent spend-caps, a runaway-spend circuit-breaker, showback). **But they are designed in isolation.** Today a budget breach **halts** spend-incurring actions (the circuit-breaker is a *guard*, not a *graceful degrader*), and an SLO breach escalates an incident — neither talks to the other. For an AI-native control plane the right primitive is *"hold this availability target **within** this budget,"* not "pick one." Without a designed linkage, cost controls can themselves *cause* outages (a tripped breaker hangs requests) and the Planner minimizes cost unbounded by any availability floor.

## Decision
Treat **cost as an availability lever**: cost controls **shed quality-of-service gracefully** before they ever hard-stop, and provisioning optimizes cost **within** an availability floor.

1. **`costAvailabilityProfile` per Camp/Bindle.** A declarative profile binds a budget to an availability target with ordered **degradation tiers**:
   ```ts
   costAvailability({
     budgetUsd: 5000,                 // period hard cap
     availabilitySlo: 0.999,          // nominal target ([ADR-0045](./ADR-0045-slo-as-code-and-alerting.md))
     tiers: [                         // entered as spend velocity approaches the cap
       { name: "nominal", upToBudgetFrac: 0.80, slo: 0.999 },
       { name: "reduced", upToBudgetFrac: 0.95, slo: 0.99,  shed: ["batch", "analytics"] },
       { name: "minimal", upToBudgetFrac: 1.00, slo: 0.95,  shed: ["non-critical"] },
     ],
     strategy: "shed-low-priority-first",   // | "degrade-all" | "fail-closed"
   })
   ```
   Resources/handlers carry a **`priority`/criticality** label (`critical`|`standard`|`low`); tiers shed lowest-priority load first.
2. **Spend velocity is a policy dimension.** The `MeteringView` ([ADR-0039](./ADR-0039-billing-quota-cost-attribution.md)) feeds **real-time spend velocity** to the policy plane ([Plan 30](../30-policy-plane.md)); a decision can ask *"at this velocity, do we cross tier N before period end?"* A **`policy.Decided`** yields: `allow` (fits nominal) · **`allow-degraded`** + obligation (*"enter reduced tier; shed batch"*) · `deny`/`fail-closed` (would breach the hard cap).
3. **Graceful degradation is a durable saga obligation, not a halt.** Crossing a tier emits **`spend.DegradationRequired`**; the **SRE operator** ([Plan 40](../40-operator-agents.md)) + runtime enforce it by composing existing levers — **scale-to-zero** non-critical workloads ([Plan 16](../16-cost-finops.md) wasm economics), **feature-flag shed** ([Plan 37](../37-feature-flags-progressive-delivery.md)), **cache-TTL increase / expensive-query shed**, **request-priority shedding** (an honest `503` + `Retry-After` to low-priority callers, never a silent hang), and **canary hold**. The **runaway-spend circuit-breaker becomes the last resort** *after* graceful tiers are exhausted — degradation is the path *to* it, not a synonym for it. Recovery emits **`spend.DegradationRolledBack`** (restore the higher tier when velocity falls).
4. **SLO-bounded cost optimization at plan-time.** The Planner objective ([ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md)) becomes *"minimize cost **subject to** the availability floor"* — pick the cheapest realization that still meets `availabilitySlo` (e.g. cheapest provider/topology that satisfies the target), not unbounded min-cost. The cost **and** the SLO rationale are recorded in `match.Decided`/`deployment.Planned`.
5. **Incident tie-in.** A cost-induced degradation is a first-class incident class ([Plan 44](../44-sre-incident-management.md)): the SRE operator may *propose* cost-efficient remediation (*"hold 99% to stay under budget while the leak is fixed"*) as a gated obligation, and postmortem-by-replay shows exactly which load was shed and when.

**Events:** `spend.DegradationRequired` · `spend.DegradationApplied` · `spend.DegradationRolledBack` (ride the existing `policy.Decided` + saga/obligation model; no new engine).

## Alternatives considered
- **Keep cost and availability independent (status quo).** Rejected: the breaker can cause the outage it's meant to prevent, and the Planner has no availability floor — the exact "availability through cost controls" gap.
- **Hard-stop on budget only (no tiers).** Rejected: turns a cost event into a binary outage; tiers + priority shedding preserve critical traffic.
- **A new cost-degradation engine.** Rejected: reuse the policy plane (obligations), feature flags, the SRE operator, scale-to-zero, and the spend circuit-breaker — this ADR is a composition + schema, not new runtime.

## Consequences
- **(+)** Realizes **availability through cost controls**: agents/operators can target *"99.9% within $5k,"* and cost pressure degrades QoS gracefully instead of failing.
- **(+)** Reuses existing machinery (policy obligations, flags, SRE operator, Planner objective, `MeteringView`, circuit-breaker) — minimal new surface (a profile + three events + a Planner constraint).
- **(+)** Honest failure modes (priority shedding + `503`+`Retry-After`) instead of silent hangs under budget pressure.
- **(−)** Degradation tiers + priority labels are new authoring surface; sensible defaults (one nominal tier, fail-closed) keep it optional.
- **(−)** Tuning tier thresholds + velocity windows to avoid flapping between tiers is an iteration hook (shared with the [ADR-0039](./ADR-0039-billing-quota-cost-attribution.md) breaker tuning).
- **(↔)** Extends [Plan 16](../16-cost-finops.md) (a cost/availability section), [Plan 5](../05-reliability-ha.md) (degradation as a reliability strategy), and the [Plan 11](../11-event-model.md) event catalog.
