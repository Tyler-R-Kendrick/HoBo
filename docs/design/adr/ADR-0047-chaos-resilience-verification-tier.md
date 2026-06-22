# ADR-0047 — Chaos / continuous-resilience verification tier

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 9 — Verification](../09-verification-open-questions.md) · [Plan 5 — Reliability/HA](../05-reliability-ha.md) (failure taxonomy) · [Plan 11](../11-event-model.md) (replay) · [ADR-0021](./ADR-0021-nfr-baselines-slos.md) (the RTO/RPO targets chaos validates) · [chaos-engineering pattern](../../../patterns/chaos-engineering.md) · open question [#28](../09-verification-open-questions.md)
- **Origin:** the ecosystem review found HoBo had ad-hoc fault-injection *tests* ([Plan 9](../09-verification-open-questions.md)) + a failure taxonomy ([Plan 5](../05-reliability-ha.md)) but no first-class **chaos-engineering** tier.

## Context
HoBo already lists fault-injection tests (kill the Yard mid-deploy, partition an actor, inject provider failures, [Plan 9](../09-verification-open-questions.md)) and defines a failure taxonomy + reliability algorithms ([Plan 5](../05-reliability-ha.md)). What's missing is the **discipline**: a steady-state-hypothesis-driven, blast-radius-controlled, continuous/automated chaos tier that *validates the resilience claims* ([ADR-0021](./ADR-0021-nfr-baselines-slos.md) RTO/RPO; canary auto-rollback; saga compensation) rather than asserting them. HoBo is unusually well-suited to this because **event-sourcing + deterministic replay make failures cheap to reproduce**.

## Decision
1. **Chaos is a first-class verification tier** ([Plan 9](../09-verification-open-questions.md)), alongside unit / conformance / integration / E2E / determinism-replay. Each chaos experiment is defined by a **steady-state hypothesis** (an SLO/health invariant, [ADR-0045](./ADR-0045-slo-as-code-and-alerting.md)), a **fault to inject**, a **blast-radius bound** (tenant/Camp/resource scope), and an **abort condition**.
2. **Fault injection reuses HoBo's own seams** — kill/partition an actor (lease/fencing, [Plan 5](../05-reliability-ha.md)), drop/delay events, fail a provider call (the Executor boundary), expire a token, trip the spend breaker, revoke a session — driven through a **`chaos` capability** (a test/ops-time injector, policy-gated so it can never run unscoped in prod). External engines (Chaos Mesh / LitmusChaos / AWS FIS) are **optional providers** behind it.
3. **Event-sourcing makes it cheap + safe.** Every injected fault + observed outcome is an event (`chaos.*`); a failed experiment yields a **replayable trace** that becomes a permanent regression test (the same pattern as AI live-fix, [Plan 23](../23-stubbable-ai-implementations.md)). Determinism ([Plan 11](../11-event-model.md)) means a discovered failure reproduces exactly.
4. **Continuous + gated.** Chaos runs in CI (against `runtime-local` + a Camp) and, optionally, **continuously in prod within a blast-radius + policy budget** ([Plan 30](../30-policy-plane.md) gate; error-budget-aware, [ADR-0045](./ADR-0045-slo-as-code-and-alerting.md)) — game-day-style, never unbounded.

## Alternatives considered
- **Keep ad-hoc fault-injection tests only.** Rejected: they assert specific cases but don't form a hypothesis-driven, continuous discipline that validates the resilience SLOs.
- **Adopt a chaos engine (Chaos Mesh/Litmus/FIS) as the model.** Rejected as the model (kept as optional providers): HoBo's faults are best injected at its *own* seams (actors/events/Executor/tokens) and recorded as events; external engines cover infra-level faults behind the `chaos` capability.
- **Prod chaos always-on by default.** Rejected: must be opt-in, blast-radius-bounded, and policy/error-budget-gated — chaos that ignores the budget is just an outage.

## Consequences
- **(+)** Closes #28: resilience claims ([ADR-0021](./ADR-0021-nfr-baselines-slos.md) RTO/RPO, auto-rollback, compensation) are *validated continuously*, not asserted; failures become replayable regression tests.
- **(+)** Reuses HoBo's failure taxonomy ([Plan 5](../05-reliability-ha.md)), event-sourcing/replay ([Plan 11](../11-event-model.md)), policy gating ([Plan 30](../30-policy-plane.md)), and SLO/error-budget ([ADR-0045](./ADR-0045-slo-as-code-and-alerting.md)) — the `chaos` capability + `chaos.*` events are the only new surface; engines are optional providers.
- **(−)** Prod chaos is operationally sensitive; the blast-radius + budget gating must be airtight (a bad experiment is an incident). Mitigated by policy gating + abort conditions + air-gap-friendly local-first chaos.
- **(−)** Chaos coverage is only as good as the injectable seams; non-HoBo-mediated failures (e.g. a provider's internal bug) still need the external-engine providers.
