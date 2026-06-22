# Build stage 6 — HA, FinOps, UX & governance planes

> [Phases index](./README.md) · realizes [Plan 5](../05-reliability-ha.md), [Plan 16](../16-cost-finops.md), [Plan 7](../07-ui-dashboard.md), [Plan 14](../14-observability.md), and the governance planes + ports [Plan 45](../45-app-communications.md)–[Plan 48](../48-marketplace-ecosystem.md).

**Objective.** Production hardening + breadth: the reliability/HA algorithms, deployment strategies, the cost model + showback, the full dashboard, multi-region/DR, and the governance planes + ports (the `notify` port, compliance/governance enforcement, AI safety, Registry distribution). UI-layer generation and marketplace monetization are **out of scope** ([ADR-0064](../adr/ADR-0064-scope-ai-native-meta-cloud.md)).
**Depends on.** Stage 4 (and stage 5 for evolution/live-fix integration).

> **Pipelines & Workload Profiles:** add **Pipelines** (rule-based triggers + approval gates, [Plan 28](../28-relay-gitops-pipelines.md)) and **Workload Profiles** ([Plan 27](../27-drivers-packs-profiles.md)); the dashboard gains the **Resource Graph / matching-decision / Delta-diff / Pipelines** views ([Plan 7](../07-ui-dashboard.md)); cost objective uses **env-type matching** to pick cheap variants ([Plan 16](../16-cost-finops.md)).

> **Operators + SRE:** this stage lands the operational Crew on the HA/observability substrate — **Endpoint Monitor** + the **SRE operator** with **incident management, runbooks & self-healing** ([Plan 40](../40-operator-agents.md)/[Plan 44](../44-sre-incident-management.md)) (Incident aggregate, the diagnose→classify→auto-fix/propose/escalate decision tree, MTTD/MTTR SLOs, postmortem-as-replay). Builds on stage 5 live-fix + the SLO/alerting model ([ADR-0045](../adr/ADR-0045-slo-as-code-and-alerting.md)). *(No UX Designer operator / UI-layer generation — out of scope, [ADR-0064](../adr/ADR-0064-scope-ai-native-meta-cloud.md).)*

> **Gates hardening:** harden **obligations** as durable effects (require-canary/approval tracked to completion) and the **remediation/auto-fix** loop (classify failure → propose safe fix, gated) ([Plan 30](../30-policy-plane.md)/[Plan 23](../23-stubbable-ai-implementations.md)); the dashboard gains a **`hobo verify` / gate-decision** view (per-gate results + `explain-failure` replay).

> **Portability & patchability hardening:** this stage also lands **component-host conformance** (the `@hobo/conformance/component-host` suite + host version-pinning + cross-host E2E + the **PortabilityReport** scorecard, [ADR-0067](../adr/ADR-0067-component-host-portability.md)/[Plan 22](../22-wiring-manifest.md)) and **derivative upgrade paths** (seam semver + signed `derivative.json` + the `hobo derivative upgrade` ceremony + core breaking-change manifests, [ADR-0068](../adr/ADR-0068-derivative-upgrade-paths.md)) over the multi-provider ([ADR-0024](../adr/ADR-0024-portability-conformance-guarantee.md)) and patchability ([Plan 43](../43-patchability-extensibility.md)) work.

> **Governance planes + ports:** broaden the platform over existing machinery (no new runtime) — the **`notify` port** (the `notify` family as a cloud-messaging port in the resource catalog, [Plan 45](../45-app-communications.md)/[ADR-0059](../adr/ADR-0059-app-communications-notify.md)), **compliance & data governance enforcement** (classification→residency/retention obligations + crypto-shred erasure + an OCSF attestation export, [Plan 46](../46-compliance-governance.md)/[ADR-0060](../adr/ADR-0060-compliance-governance-plane.md)), **AI safety & model governance** (model registry + `guardrail` capability + red-teaming, [Plan 47](../47-ai-safety-model-governance.md)/[ADR-0061](../adr/ADR-0061-ai-safety-model-governance.md)), and **Registry distribution** (governed publish/discover/install/trust over signed/certified artifacts; never-gate-portability; no monetization, [Plan 48](../48-marketplace-ecosystem.md)/[ADR-0062](../adr/ADR-0062-marketplace-ecosystem.md)).

## Workstream 1 — Reliability & HA ([Plan 5](../05-reliability-ha.md))
1. Actor availability: single-writer **leases + fencing tokens**, placement + failover.
2. Control-plane HA: event-store **replication (quorum)**, leader election for singletons.
3. Provider resilience: circuit breakers, retry budgets, bulkheads/backpressure per tenant+provider.
4. Drift loop: periodic resync + policy (`heal`/`propose`/`ignore`).

## Workstream 2 — Deployment strategies ([Plan 5](../05-reliability-ha.md))
1. Saga templates: **recreate / blue-green / canary / progressive**, with health-gated promotion + auto-rollback.
2. Wire health signals from the data plane (Camp runtime metrics) + provider health checks into the gates.

## Workstream 3 — Cost & FinOps ([Plan 16](../16-cost-finops.md))
1. Plan-time **cost estimate** from `cost.json` × usage profile + egress per connectivity tier; show in `hobo plan`.
2. Planner cost objective (cost/latency/stay-on-one-cloud blend); record rationale.
3. **Budgets + spend-caps** as policy gates (incl. agent caps); showback per tenant/Bindle/Camp; optional carbon term.
4. **Cost-driven graceful degradation** ([ADR-0066](../adr/ADR-0066-cost-driven-graceful-degradation.md)): the `costAvailabilityProfile` (budget + `availabilitySlo` + ordered degradation tiers + priority shedding), spend-velocity as a policy input → `allow-degraded`, the `spend.Degradation*` saga (scale-to-zero/feature-flag/cache-TTL/request-priority shed, canary hold; runaway-spend breaker as last resort), and the **SLO-bounded Planner objective** (min-cost subject to the availability floor).

## Workstream 4 — Dashboard (full) ([Plan 7](../07-ui-dashboard.md))
1. Build all views: deployments timeline (replay/time-travel), topology graph, run inspector (+ replay-diff), registry browser, **credential audit**, cost/FinOps, **link map** + **cross-WIT-call traces**, drift.
2. Inline plan-preview approval, policy-gate approvals, promote/rollback, live log/stream tail.

## Workstream 5 — Multi-region & DR ([Plan 5](../05-reliability-ha.md), [Plan 14](../14-observability.md))
1. Multi-region topology (active-active log vs active-passive) + cross-region log replication.
2. **DR = replay**: `hobo yard up --restore <log>` rebuilds the Yard + projections + actors.
3. SLOs + burn-rate alerting; OTLP export ([Plan 14](../14-observability.md)).

## Workstream 6 — Governance planes + ports ([Plan 45](../45-app-communications.md)–[Plan 48](../48-marketplace-ecosystem.md))
1. **The `notify` port**: the `notify` family (`email`/`sms`/`push`/`webhookOut`) as a cloud-messaging port in the resource catalog + secretless-brokered providers; sends are idempotent steps, delivery event-sourced (`notification.*`), rate/quiet-hours as policy obligations ([Plan 45](../45-app-communications.md)).
2. **Compliance & governance enforcement**: classification labels → residency/retention obligations enforced at `can-deploy` + runtime; crypto-shred erasure + projection purge; a signed OCSF attestation export for external GRC tools ([Plan 46](../46-compliance-governance.md)).
3. **AI safety & model governance**: model/prompt/eval-dataset registry (signed, provenance); the `guardrail` capability as a policy-gated step wrapping `agent()`/`"use training"`/generated outputs; red-teaming as a chaos-tier sibling ([Plan 47](../47-ai-safety-model-governance.md)).
4. **Registry distribution**: the `listing.*` lifecycle (publish→discover→install→trust) over signed/certified artifacts via Registry + Packs, never gating portability; **no monetization** ([Plan 48](../48-marketplace-ecosystem.md)/[ADR-0064](../adr/ADR-0064-scope-ai-native-meta-cloud.md)).

## Deliverables
- HA mechanisms; rollout saga templates; cost model + budgets + showback; full dashboard; multi-region + DR; the governance planes + ports (the `notify` port · governance enforcement · AI-safety · Registry distribution).

## Exit criteria (acceptance)
- A **canary** with an injected health regression **auto-rolls-back**; blue/green flip + soak works.
- **Plan-time cost estimate** is within tolerance of a known fixture; a budget breach blocks or requires approval.
- Kill a Yard node → deploy resumes < target (lease TTL + tail replay); **DR rebuild** from replicated log < target RTO.
- Dashboard renders every view from projections only (no live-provider reads).
- A `notify` send is event-sourced and a rate/quiet-hours obligation defers it; a classified field drives an enforced residency/retention obligation and an erasure crypto-shreds its key; a guardrail blocks a flagged model output; an uncertified Registry listing is unlisted while a certified one installs via Matching.

## Risks / iteration hooks
- Consensus choice (own Raft vs delegate to the Camp's runtime store); RPO/RTO targets.
- Multi-region: active-active vs active-passive.
- Canary health-signal sources + the auto-rollback decision function.
