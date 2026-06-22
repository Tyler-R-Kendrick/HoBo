# ADR-0045 — SLO-as-code, error-budget gating & alerting model

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 14 — Observability](../14-observability.md) (SLOs & alerting) · [ADR-0021](./ADR-0021-nfr-baselines-slos.md) (NFR/SLO baselines) · [Plan 5 — Reliability/HA](../05-reliability-ha.md) · [Plan 29](../29-contracts-compatibility.md)/[Plan 30](../30-policy-plane.md) (can-deploy / policy gating) · [Plan 11](../11-event-model.md) (`alert.*`) · [OpenSLO standard](../../../standards/openslo.md) · [Prometheus AlertManager](../../../technologies/prometheus-alertmanager.md) · open questions [#25](../09-verification-open-questions.md), [#26](../09-verification-open-questions.md)
- **Origin:** the ecosystem review found HoBo had built-in SLOs + burn-rate alerts ([Plan 14](../14-observability.md)) but (#25) SLOs weren't **declared as code** with error budgets that **drive gates**, and (#26) alert *routing* existed but not a full **AlertManager-style** model.

## Context
[Plan 14](../14-observability.md) ships built-in SLOs + burn-rate alerts and alert routing as a provider capability; [ADR-0021](./ADR-0021-nfr-baselines-slos.md) sets NFR/SLO baselines. Two gaps: SLOs are platform-defined rather than **declarative, app-owned, error-budget-bearing** (the [OpenSLO](../../../standards/openslo.md) model), and the budget doesn't feed HoBo's gates; and alerting lacks the **grouping / dedup / silencing / inhibition / routing-tree** depth of the [Prometheus AlertManager](../../../technologies/prometheus-alertmanager.md) model. Both live in the observability/reliability area and share the burn-rate signal, so they're decided together.

## Decision
1. **SLOs are declared as code, OpenSLO-aligned.** A Bindle/Camp declares **SLOs + SLIs + objectives + error budgets** (an [OpenSLO](../../../standards/openslo.md)-compatible shape; HoBo speaks the standard, the SLI source is a metric provider behind a port). SLIs are computed from the existing telemetry ([Plan 14](../14-observability.md) OTel/projections). Declarations are versioned config (part of the resolved Set, [Plan 26](../26-environments-deltas.md)).
2. **Error budgets drive gates.** Burn-rate + remaining-budget is a **policy input**: a policy ([Plan 30](../30-policy-plane.md)) can **freeze deploys / require approval when the budget is exhausted or burning too fast** (a `can-deploy` dimension, [Plan 29](../29-contracts-compatibility.md)), and an obligation can **auto-revert a rollout or feature-flag** ([ADR-0044](./ADR-0044-feature-flags-progressive-delivery.md)) on burn. SLO state is event-sourced (`slo.*`/budget facts derived as a projection).
3. **Alerting is an AlertManager-style model over HoBo events.** Alerts are derived from SLO burn + health/drift/spend signals ([Plan 5](../05-reliability-ha.md)/[ADR-0039](./ADR-0039-billing-quota-cost-attribution.md)) and routed through a model with **grouping, deduplication, silencing, inhibition, and a routing tree** to **notification receivers** (email/Slack/PagerDuty/webhook) that are **providers behind a port**. Alert lifecycle is **event-sourced** (`alert.Fired`/`alert.Grouped`/`alert.Silenced`/`alert.Inhibited`/`alert.Resolved`) so "why did (or didn't) this page" is replayable — and high-risk policy gates ([Plan 6](../06-ai-native-agent-auth.md)) post to the same receivers.

## Alternatives considered
- **Keep platform-defined SLOs only.** Rejected: apps need to own their own SLOs/budgets, and budgets are most valuable when they *gate* (freeze deploys), which requires them as first-class declared state.
- **Invent a proprietary SLO format.** Rejected: OpenSLO is the standard; speak it (engine/SLI-source behind a port) per HoBo's boundary-standards stance ([ADR-0046](./ADR-0046-boundary-standards-cloudevents-ocsf-otlp.md)).
- **Adopt Prometheus AlertManager wholesale as the model.** Rejected as the *model* (kept as an optional provider): HoBo's alerts derive from its **event-sourced** signals, so the routing/silencing/inhibition concepts are adopted but expressed natively + event-sourced; AlertManager (or PagerDuty/etc.) can be a notification-receiver provider.
- **Leave alerting as bare routing.** Rejected: without grouping/dedup/silencing/inhibition, real operations drown in noise.

## Consequences
- **(+)** Closes #25 + #26: SLOs become app-owned, declarative (OpenSLO), and **consequential** (error budgets gate deploys + auto-revert rollouts/flags); alerting gains production-grade grouping/silencing/inhibition, event-sourced for "why did this page" replay.
- **(+)** Reuses existing telemetry ([Plan 14](../14-observability.md)), the policy/can-deploy gate ([Plan 29](../29-contracts-compatibility.md)/[Plan 30](../30-policy-plane.md)), feature-flag auto-revert ([ADR-0044](./ADR-0044-feature-flags-progressive-delivery.md)), and the event log; engines/receivers sit behind ports (OpenSLO tooling, AlertManager/PagerDuty) per the standard stance.
- **(−)** SLI computation fidelity depends on the metric source; cross-Camp SLO aggregation inherits the bounded-staleness model ([ADR-0040](./ADR-0040-cross-camp-stateful-consistency.md)).
- **(−)** An error-budget *deploy freeze* is a sharp control — its thresholds need tuning to avoid blocking legitimate fixes (mitigation: a break-glass waiver via policy, [Plan 30](../30-policy-plane.md)).
