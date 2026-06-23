# Governance, verification, SLO & cost — consolidated decisions

> Consolidated ADR decisions for **governance, verification, slo & cost**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0015
**Contracts & policy are HoBo-native planes; a single `can-deploy`/Gatekeeper gate composes the checks; obligations are durable effects.**

**Decision:** consumer-driven contracts/compatibility ([Plan 29](../contracts-policy-flags.md#plan-29)) and policy decisions ([Plan 29](../contracts-policy-flags.md#plan-29)) are first-class, HoBo-native planes; engines sit behind ports.

1. **Contract plane.** The `contract-engine` runs **PACT-style consumer-driven contract testing as the built-in, default behavior** — an internal implementation detail of the contract plane, never a user-facing option to swap; developers declare contracts and never touch PACT directly. Compatibility is verified by construction with no extra wiring. HoBo owns the Contract IR; ecosystems integrate via adapters with no hard dep.
2. **Policy plane.** The `policy-engine` is a built-in HoBo engine; policy is **typed TypeScript** by default, and HoBo owns the Policy IR.
3. **One Gatekeeper gate composes everything.** Deployability is a single explainable decision — contracts-compatible AND policy-allows/approves AND eval-gates-pass AND conformance AND within-cost AND signed/attested — evaluated at Delta→Set/promote and surfaced as `hobo verify` ([Plan 29](../contracts-policy-flags.md#plan-29)/[Plan 25](../platform-engineering.md#plan-25)). One event-sourced decision replaces scattered CI gates.
4. **Obligations are durable effects, not advice.** An "allow but require X" obligation (canary/approval/auth/shadow-eval) is realized as a HoBo effect/saga and tracked `ObligationCreated→Satisfied`; an unmet obligation blocks ([Plan 29](../contracts-policy-flags.md#plan-29)/[Plan 5](../reliability-observability-cost.md#plan-05)).

**Consequences:** compatibility and governance are enforced by construction and fully auditable — one event-sourced gate, durable obligations, and HoBo-owned IRs with engines behind ports. (Resolves ADR-P3.)

## ADR-0044
**Feature flags & progressive delivery.**

### Context
HoBo controls *deploys* with canary/progressive rollout ([Plan 5](../reliability-observability-cost.md#plan-05)), Delta→Set gates ([Plan 25](../platform-engineering.md#plan-25)), and policy obligations ([Plan 29](../contracts-policy-flags.md#plan-29)). It also toggles *behavior within a running version* — kill-switches, gradual `%` rollout, per-segment targeting, experiments — without a redeploy. Feature flags are the standard answer (OpenFeature is the CNCF standard for flag evaluation), provided in a way that composes with HoBo's audit, policy, identity, and reactive planes rather than as a bolt-on.

### Decision
1. **A first-class `feature-flag` port (`hobo:feature-flag`), OpenFeature-compatible.** HoBo speaks the OpenFeature evaluation API; the **built-in flag store is the default** (zero-dep, air-gap-friendly), and **OpenFeature providers** (flagd/LaunchDarkly/…) are **opt-in per-Camp adapters** (Matching, [ADR-0033](05-config-matching-environments.md#adr-0033)). Flag types = boolean/string/number/object. Definitions are **IfC** (declared in the Bindle); values/targeting are runtime state.
2. **Change governance: event-sourced + optionally policy-gated + reactive.** Every value/targeting change is a `flag.*` event ([Plan 11](../event-model.md#plan-11), full audit/replay); a flip can pass through the **policy plane** ([Plan 29](../contracts-policy-flags.md#plan-29)) so prod kill-switches / risky `%` bumps require approval or carry obligations (e.g. auto-revert on SLO burn); a change is a **`data.Changed`-class signal** so reactive queries/clients (`useFlag`/`useQuery`, [Plan 32](../data-plane.md#plan-32)) re-evaluate live.
3. **In-process, deterministic, identity-aware evaluation.** Components evaluate flags **in-process** against a ruleset synced via the Streamer/event log (edge-friendly, no SPOF); targeting context is the unified **`PrincipalRef`** (`ctx.user` [ADR-0038](02-identity-security.md#adr-0038) / `ctx.identity`); evaluation is a **pure function of `(ruleset@seq, context)`** → replayable + safe inside a reactive `query()` ([ADR-0050](03-data-plane.md#adr-0050)).
4. **Flags + deploy gates compose** for progressive delivery: canary = the deploy dial, flag `%` = the release dial; health signals can auto-revert a flag via a policy obligation.
5. **Events** `flag.Defined`/`flag.Changed`/`flag.Evaluated`(sampled)/`flag.Archived`; flip-gate decisions ride `policy.Decided`.

### Alternatives considered
- **Flags as policy-plane decisions (no new port).** Rejected: overloads the policy plane with high-frequency runtime evaluations, loses OpenFeature ecosystem compatibility, and conflates "may I" (policy) with "is this on" (flag). (Flags still *use* the policy plane for *gating flips*, which is the right seam.)
- **BYO external flag SDK (no HoBo capability).** Rejected: leaves the listed primitive unowned; flags wouldn't be event-sourced/reactive/gated like the rest of HoBo, and targeting couldn't reuse `ctx.user`/`ctx.identity`.
- **Central evaluation service.** Rejected: per-eval network hop + SPOF + non-deterministic for replay/reactive; in-process sync matches HoBo's grain.
- **Client-side-only evaluation.** Rejected: untrusted, no server enforcement (unusable for kill-switches/entitlements).
- **Deploy-only flag changes.** Rejected: defeats decoupling release from deploy.

### Consequences
- **(+)** Closes #24 with a standard-compatible capability that uniquely composes with HoBo's audit (`flag.*`), policy (gated flips + obligations), identity (`ctx.user` targeting), and reactive (`useFlag` re-eval) planes — more than a standalone flag tool offers.
- **(+)** Built-in default keeps it air-gap-friendly; OpenFeature compatibility avoids lock-in and lets teams bring an existing flag provider.
- **(+)** Deterministic in-process eval is edge-friendly and replay-safe; progressive delivery (deploy + release dials) becomes one coherent story with auto-revert.
- **(−)** A synced ruleset means a bounded propagation delay on a flip (seconds), like any flag system; kill-switch latency is tied to sync interval (tunable).
- **(−)** Another capability + event group to build and conformance-test; the targeting-rule DSL must be kept aligned with the policy/`.allow()` predicate language to avoid a second rule dialect.

## ADR-0045
**SLO-as-code, error-budget gating & alerting model.**

### Context
[Plan 5](../reliability-observability-cost.md#plan-05) ships built-in SLOs + burn-rate alerts and alert routing as a provider capability; [ADR-0021](08-scope-and-requirements.md#adr-0021) sets NFR/SLO baselines. SLOs are **declarative, app-owned, error-budget-bearing** (the [OpenSLO](../../../standards/openslo.md) model) and the budget feeds HoBo's gates; alerting carries the **grouping / dedup / silencing / inhibition / routing-tree** depth of the [Prometheus AlertManager](../../../technologies/prometheus-alertmanager.md) model. Both live in the observability/reliability area and share the burn-rate signal, so they're decided together.

### Decision
1. **SLOs are declared as code, OpenSLO-aligned.** A Bindle/Camp declares **SLOs + SLIs + objectives + error budgets** (an [OpenSLO](../../../standards/openslo.md)-compatible shape; HoBo speaks the standard, the SLI source is a metric provider behind a port). SLIs are computed from the existing telemetry ([Plan 5](../reliability-observability-cost.md#plan-05) OTel/projections). Declarations are versioned config (part of the resolved Set, [Plan 25](../platform-engineering.md#plan-25)). **SRE process SLIs are first-class too:** `sre.mttd` (detect) and `sre.mttr` (resolve) are declared the same way and their burn gates deploys / requires a postmortem ([Plan 40](../operators-sre.md#plan-40)).
2. **Error budgets drive gates.** Burn-rate + remaining-budget is a **policy input**: a policy ([Plan 29](../contracts-policy-flags.md#plan-29)) can **freeze deploys / require approval when the budget is exhausted or burning too fast** (a `can-deploy` dimension, [Plan 29](../contracts-policy-flags.md#plan-29)), and an obligation can **auto-revert a rollout or feature-flag** ([ADR-0044](#adr-0044)) on burn. SLO state is event-sourced (`slo.*`/budget facts derived as a projection).
3. **Alerting is an AlertManager-style model over HoBo events.** Alerts are derived from SLO burn + health/drift/spend signals ([Plan 5](../reliability-observability-cost.md#plan-05)/[ADR-0039](#adr-0039)) and routed through a model with **grouping, deduplication, silencing, inhibition, and a routing tree** to **notification receivers** (email/Slack/PagerDuty/webhook) that are **providers behind a port**. Alert lifecycle is **event-sourced** (`alert.Fired`/`alert.Grouped`/`alert.Silenced`/`alert.Inhibited`/`alert.Resolved`) so "why did (or didn't) this page" is replayable — and high-risk policy gates ([Plan 6](../ai-native-agent-auth.md#plan-06)) post to the same receivers.

### Alternatives considered
- **Keep platform-defined SLOs only.** Rejected: apps need to own their own SLOs/budgets, and budgets are most valuable when they *gate* (freeze deploys), which requires them as first-class declared state.
- **Invent a proprietary SLO format.** Rejected: OpenSLO is the standard; speak it (engine/SLI-source behind a port) per HoBo's boundary-standards stance ([ADR-0046](#adr-0046)).
- **Adopt Prometheus AlertManager wholesale as the model.** Rejected as the *model* (kept as an optional provider): HoBo's alerts derive from its **event-sourced** signals, so the routing/silencing/inhibition concepts are adopted but expressed natively + event-sourced; AlertManager (or PagerDuty/etc.) can be a notification-receiver provider.
- **Leave alerting as bare routing.** Rejected: without grouping/dedup/silencing/inhibition, real operations drown in noise.

### Consequences
- **(+)** Closes #25 + #26: SLOs become app-owned, declarative (OpenSLO), and **consequential** (error budgets gate deploys + auto-revert rollouts/flags); alerting gains production-grade grouping/silencing/inhibition, event-sourced for "why did this page" replay.
- **(+)** Reuses existing telemetry ([Plan 5](../reliability-observability-cost.md#plan-05)), the policy/can-deploy gate ([Plan 29](../contracts-policy-flags.md#plan-29)/[Plan 29](../contracts-policy-flags.md#plan-29)), feature-flag auto-revert ([ADR-0044](#adr-0044)), and the event log; engines/receivers sit behind ports (OpenSLO tooling, AlertManager/PagerDuty) per the standard stance.
- **(−)** SLI computation fidelity depends on the metric source; cross-Camp SLO aggregation inherits the bounded-staleness model ([ADR-0040](05-config-matching-environments.md#adr-0040)).
- **(−)** An error-budget *deploy freeze* is a sharp control — its thresholds need tuning to avoid blocking legitimate fixes (mitigation: a break-glass waiver via policy, [Plan 29](../contracts-policy-flags.md#plan-29)).

## ADR-0046
**Boundary standards: CloudEvents, OCSF & OTLP.**

### Context
HoBo's internal source of truth is its rich `EventEnvelope` ([Plan 11](../event-model.md#plan-11)) — HoBo-native, carrying `seq`/`streamId`/`causationId`/fencing/idempotency that CloudEvents doesn't. At its **boundaries** — exporting events to external consumers, shipping audit data to a SIEM, emitting telemetry — speaking the relevant open standards avoids lock-in and integration friction. HoBo speaks **OTel/OpenInference** ([Plan 5](../reliability-observability-cost.md#plan-05)), **CloudEvents** (event export), **OCSF** (security/audit normalization), and **OTLP-native** export.

### Decision
1. **Internal envelope stays native; export is CloudEvents-compatible.** The internal `EventEnvelope` is unchanged (it's a superset). At the **export boundary** (webhooks, external subscribers, the GitOps/Pipelines triggers [Plan 25](../platform-engineering.md#plan-25)), HoBo emits **[CloudEvents](../../../standards/cloudevents.md)** — a deterministic mapping (`type`→`type`, `id`→`id`, `streamId`→`source`+`subject`, `ts`→`time`, `data`→`data`, with HoBo-specific fields as CloudEvents **extensions**). Internal HoBo→HoBo stays native; only the external surface is CloudEvents.
2. **Audit log exports to OCSF.** Security-relevant events (`token.*`, `identity.*`, `policy.Decided`, `domain.Cert*`, `registry.BundleImported`, `flag.Changed`, …) map to **[OCSF](../../../standards/ocsf.md)** classes (Authentication, Authorization/Entitlement, Configuration/Change, etc.) for export to a SIEM — a projection/exporter over the existing audit streams ([Plan 12](../security-networking.md#plan-12)), not a change to how HoBo stores them.
3. **OTLP-native telemetry, confirmed.** Telemetry (metrics/traces/logs incl. OpenInference AI spans) exports over **OTLP** to the tenant's backend ([Plan 5](../reliability-observability-cost.md#plan-05)) — already the design; this ADR pins it as the committed wire format so there's no proprietary telemetry path.
4. **All three are boundary mappings behind exporters**, not model changes — HoBo's event-sourced core is untouched; the standards are how it *speaks to the outside*.

### Alternatives considered
- **Make the internal `EventEnvelope` literally CloudEvents.** Rejected: CloudEvents lacks `seq`/optimistic-concurrency/fencing/causation semantics HoBo's replay + audit depend on; map at the boundary instead, keeping the superset internally.
- **Proprietary audit/event/telemetry formats.** Rejected: lock-in + integration friction; speaking CloudEvents/OCSF/OTLP is the boundary-standards stance and a security/compliance selling point.
- **Skip OCSF (just ship raw audit).** Rejected: enterprises run SIEMs that ingest OCSF; a normalized export is high-value and cheap (a projection).

### Consequences
- **(+)** Closes #27: HoBo interoperates at its boundaries (CloudEvents subscribers, OCSF SIEMs, OTLP backends) without a proprietary format, while keeping its richer internal model.
- **(+)** All three are **exporters/projections** over the existing log — minimal new machinery, no core change, and they compose with the existing event catalog ([Plan 11](../event-model.md#plan-11)).
- **(+)** OCSF audit export strengthens the enterprise/regulated story alongside air-gap ([ADR-0036](07-portability-extensibility.md#adr-0036)) and the credential audit ([Plan 6](../ai-native-agent-auth.md#plan-06)).
- **(−)** Boundary mappings must be maintained as the standards evolve (CloudEvents/OCSF versioning) and as HoBo's event catalog grows — an ongoing mapping-fidelity cost.

## ADR-0047
**Chaos / continuous-resilience verification tier.**

### Context
HoBo lists fault-injection tests (kill the Yard mid-deploy, partition an actor, inject provider failures, [Plan 9](../verification.md#plan-09)) and defines a failure taxonomy + reliability algorithms ([Plan 5](../reliability-observability-cost.md#plan-05)). On top of those sits the **discipline**: a steady-state-hypothesis-driven, blast-radius-controlled, continuous/automated chaos tier that *validates the resilience claims* ([ADR-0021](08-scope-and-requirements.md#adr-0021) RTO/RPO; canary auto-rollback; saga compensation) rather than asserting them. HoBo is unusually well-suited to this because **event-sourcing + deterministic replay make failures cheap to reproduce**.

### Decision
1. **Chaos is a first-class verification tier** ([Plan 9](../verification.md#plan-09)), alongside unit / conformance / integration / E2E / determinism-replay. Each chaos experiment is defined by a **steady-state hypothesis** (an SLO/health invariant, [ADR-0045](#adr-0045)), a **fault to inject**, a **blast-radius bound** (tenant/Camp/resource scope), and an **abort condition**.
2. **Fault injection reuses HoBo's own seams** — kill/partition an actor (lease/fencing, [Plan 5](../reliability-observability-cost.md#plan-05)), drop/delay events, fail a provider call (the Executor boundary), expire a token, trip the spend breaker, revoke a session — driven through a **`chaos` capability** (a test/ops-time injector, policy-gated so it can never run unscoped in prod). External engines (Chaos Mesh / LitmusChaos / AWS FIS) are **optional providers** behind it.
3. **Event-sourcing makes it cheap + safe.** Every injected fault + observed outcome is an event (`chaos.*`); a failed experiment yields a **replayable trace** that becomes a permanent regression test (the same pattern as AI live-fix, [Plan 23](../forge-generated-stack.md#plan-23)). Determinism ([Plan 11](../event-model.md#plan-11)) means a discovered failure reproduces exactly.
4. **Continuous + gated.** Chaos runs in CI (against `runtime-local` + a Camp) and, optionally, **continuously in prod within a blast-radius + policy budget** ([Plan 29](../contracts-policy-flags.md#plan-29) gate; error-budget-aware, [ADR-0045](#adr-0045)) — game-day-style, never unbounded.

### Alternatives considered
- **Keep ad-hoc fault-injection tests only.** Rejected: they assert specific cases but don't form a hypothesis-driven, continuous discipline that validates the resilience SLOs.
- **Adopt a chaos engine (Chaos Mesh/Litmus/FIS) as the model.** Rejected as the model (kept as optional providers): HoBo's faults are best injected at its *own* seams (actors/events/Executor/tokens) and recorded as events; external engines cover infra-level faults behind the `chaos` capability.
- **Prod chaos always-on by default.** Rejected: must be opt-in, blast-radius-bounded, and policy/error-budget-gated — chaos that ignores the budget is just an outage.

### Consequences
- **(+)** Closes #28: resilience claims ([ADR-0021](08-scope-and-requirements.md#adr-0021) RTO/RPO, auto-rollback, compensation) are *validated continuously*, not asserted; failures become replayable regression tests.
- **(+)** Reuses HoBo's failure taxonomy ([Plan 5](../reliability-observability-cost.md#plan-05)), event-sourcing/replay ([Plan 11](../event-model.md#plan-11)), policy gating ([Plan 29](../contracts-policy-flags.md#plan-29)), and SLO/error-budget ([ADR-0045](#adr-0045)) — the `chaos` capability + `chaos.*` events are the only new surface; engines are optional providers.
- **(−)** Prod chaos is operationally sensitive; the blast-radius + budget gating must be airtight (a bad experiment is an incident). Mitigated by policy gating + abort conditions + air-gap-friendly local-first chaos.
- **(−)** Chaos coverage is only as good as the injectable seams; non-HoBo-mediated failures (e.g. a provider's internal bug) still need the external-engine providers.

## ADR-0060
**Compliance & data governance as a plane over the existing planes.**

### Context
HoBo composes its compliance raw materials (audit log, OCSF export, residency rules, retention windows, `hobo:crypto`, the policy plane) into one plane of **enforced** governance. Regulated buyers need: data placed where law requires, deleted on request, retained for the right window, and **provable** via attestations. Doing this per-app or per-cloud would be inconsistent and unauditable — so governance is a plane.

### Decision
1. **Classification is the keystone.** Resources and WIT-record fields carry classification labels ([ADR-0051](03-data-plane.md#adr-0051)); `data.Classified` feeds the policy plane's existing `dataClassifications`/`region` context ([Plan 29](../contracts-policy-flags.md#plan-29)).
2. **Residency + retention are enforced as policy obligations** at **`can-deploy`** ([Plan 29](../contracts-policy-flags.md#plan-29)) *and* runtime — reusing Matching region context ([ADR-0033](05-config-matching-environments.md#adr-0033)), cross-Camp residency ([ADR-0040](05-config-matching-environments.md#adr-0040)), and sovereign mode ([ADR-0036](07-portability-extensibility.md#adr-0036)) as the ceiling. Misplacement is a gate failure, not a runtime surprise.
3. **Right-to-erasure = crypto-shredding + projection purge, never history rewrite.** PII is encrypted per-subject via `hobo:crypto`; erasure destroys the key + writes a tombstone (`erasure.Requested/Completed`) and rebuilds projections excluding the subject ([Plan 32](../data-plane.md#plan-32)). The forward-only log invariant ([Plan 11](../event-model.md#plan-11)) is preserved.
4. **Attestation bundles are assembled from the log** — SOC2/GDPR/HIPAA evidence is a signed projection over audit/OCSF + `policy.Decided` + `data.Classified`/`erasure.*`, produced by `hobo attest`; frameworks are declarative control→evidence packs.
5. **A subprocessor/DPA registry** is authoritative for who-processes-what-where; routing classified data to an unregistered/disallowed subprocessor fails `can-deploy`.

### Alternatives considered
- **Mutable/erasable event log (delete the user's events).** Rejected: destroys replay, audit, and time-travel — the core bet. Crypto-shredding gives deletion semantics without breaking the invariant.
- **Hand-maintained compliance spreadsheets / external GRC only.** Rejected as the source of truth: evidence drifts from reality. HoBo *generates* the evidence from facts and can still export to GRC tools.
- **Residency as advisory metadata.** Rejected: regulated data placement must *block* a non-compliant plan, not merely annotate it.
- **Per-app bespoke compliance.** Rejected: inconsistent and unauditable across a multi-cloud estate; governance belongs in a plane.

### Consequences
- **(+)** Turns scattered hints into enforced, provable governance with little new machinery — classification + obligations + crypto-shred + an evidence projection, all on existing planes.
- **(+)** Erasure that respects the immutable log is a genuinely hard problem solved coherently; attestations-from-the-log make audits cheaper and continuously fresh.
- **(+)** Strengthens the regulated-buyer / sovereign story already started by ADR-0036/0040.
- **(−)** Crypto-shredding requires disciplined per-subject key management and that PII actually be encrypted under those keys (a classification + codegen obligation); a mis-scoped key boundary widens erasure blast radius.
- **(−)** Attestation packs encode an interpretation of each framework's controls; they are evidence assembly, **not** a legal certification — that still requires an auditor. HoBo makes the evidence, not the opinion.

## ADR-0061
**AI safety & model governance: sandboxed execution, registry, guardrails, red-teaming.**

### Context
HoBo's differentiator is AI everywhere: trainable methods, the Forge, the Operator Crew, the generated stack. That makes the *governance* of models, prompts, and eval-datasets — and the *safety* of their outputs — load-bearing, and it makes the *execution environment* for AI work load-bearing too. Governance covers a registry for models/prompts, output moderation, adversarial red-teaming, and model cards / responsible-AI evidence, all enforced rather than advisory. Ungoverned, the differentiator is the biggest liability.

### Decision
1. **All AI work runs in sandboxed environments by default.** Every `agent()` / `"use training"` / Forge / generated-stack execution runs in an isolated, capability-scoped sandbox (the wasm runtime boundary, [Plan 20](../wasm-runtime-wit.md#plan-20)) with no ambient authority — network/filesystem/secret access is grant-only. Sandboxing is the enforced default, not an opt-in.
2. **Governance is enforced via industry toolkits as the default layer.** Moderation, guardrails, and safety run through **Microsoft's AI governance / Responsible AI toolkit** and **NVIDIA NeMo Guardrails** as the built-in, enforced default — wired into the `guardrail` capability ([Plan 21](../authoring-resources-wiring.md#plan-21)/[Plan 20](../wasm-runtime-wit.md#plan-20)) as a **policy-gated step** ([Plan 29](../contracts-policy-flags.md#plan-29)) wrapping `agent()`/`"use training"`/generated outputs. These toolkits provide the default moderation/guardrail/safety layer (input/output filtering, topical rails, jailbreak defense, responsible-AI checks); they run local-first so air-gap keeps working. `guardrail.Blocked` + `policy.Decided` make every block replayable.
3. **The Registry pattern governs models/prompts/eval-datasets** ([Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 25](../platform-engineering.md#plan-25)): versioned, signed, provenance-bearing entries; prompts are governed because they are persisted code ([ADR-0048](06-ai-generation-operators.md#adr-0048)); promotion runs the four-lens gate.
4. **Red-teaming reuses the chaos tier** ([ADR-0047](#adr-0047)): hypothesis-driven, blast-radius-bounded, policy-gated adversarial experiments (`redteam.*`); a finding becomes a permanent regression test in a governed eval-dataset.
5. **Eval-datasets are governed artifacts** — classified ([Plan 46](../governance-planes.md#plan-46)), contamination-checked, extending the PII-not-trained rule ([ADR-0025](06-ai-generation-operators.md#adr-0025)) into a lifecycle.
6. **Model cards + responsible-AI attestations** are assembled from registry + guardrail + red-team + eval facts (the [Plan 46](../governance-planes.md#plan-46) attestation mechanism), signed and replayable.

### Alternatives considered
- **Run AI work with ambient authority (no sandbox).** Rejected: a generated/agent action with host access is an unbounded blast radius; sandboxed-by-default is the only safe grain for AI-native execution.
- **Guardrails behind an optional port with a thin built-in default.** Rejected: safety must be enforced, not optional. The Microsoft Responsible AI toolkit + NVIDIA NeMo Guardrails are the default governance layer, applied to every AI call as a policy-gated step.
- **Guardrails as library calls inside app code.** Rejected: not enforceable, not auditable, easy to bypass. A policy-gated step means "why blocked" is a `policy.Decided` and coverage is a promotion contract.
- **A bespoke model-management system separate from the Registry.** Rejected: duplicates signing/provenance/conformance; models are just another signed artifact class.
- **Trust the model provider's built-in safety only.** Rejected: not portable across providers, opaque, and useless air-gapped; the default governance layer runs local-first.
- **Red-teaming as a separate one-off tool.** Rejected: reusing the chaos tier gives it the same gated, event-sourced, finding→regression-test rigor for free.

### Consequences
- **(+)** The AI-native differentiator gets a matching trust story: sandboxed-by-default execution + an enforced governance layer (Microsoft Responsible AI, NeMo Guardrails) + registry entries + the chaos-tier pattern + attestation assembly.
- **(+)** Guardrail-coverage-as-contract means an "improved" prompt can't ship if it weakens safety; red-team findings harden the system permanently; the toolkits run local-first so air-gap keeps working.
- **(+)** Model governance composes with compliance ([Plan 46](../governance-planes.md#plan-46)) — dataset classification, weights residency, and responsible-AI attestations share one evidence pipeline.
- **(−)** The guardrail layer adds latency to every AI call and streaming responses complicate post-hoc checking — addressed by streaming-aware NeMo rails and tunable sampling.
- **(−)** Model cards encode an interpretation of evolving standards; like compliance bundles they are evidence, not legal certification.

## ADR-0039
**Metering, quota, cost attribution & cost-driven availability.**

### Context
The platform **attributes cloud cost**, enforces **quotas**, guards against **runaway spend**, and uses **cost as an availability lever** — independent of any commercial model. Money-movement (billing/invoicing/chargeback) is out of scope ([ADR-0064](08-scope-and-requirements.md#adr-0064)); this ADR is **FinOps / cost-safety**, not billing. [Plan 5](../reliability-observability-cost.md#plan-05) carries plan-time cost estimation, soft/hard **budgets**, **agent spend-caps**, and a **provider-resilience circuit-breaker**; this ADR adds the **metering** model (what's measurable + how), **quota** enforcement beyond budget alerts, a **runaway-spend** safeguard, a **cost-attribution / showback** pipeline, and the **cost↔availability link** that ties cost controls to the availability machinery ([Plan 5](../reliability-observability-cost.md#plan-05): leases/fencing, replication, circuit breakers, canary/auto-rollback, drift). For an AI-native control plane the right primitive is *"hold this availability target **within** this budget,"* not "pick one" — without the linkage, cost controls can themselves *cause* outages (a tripped breaker hangs requests) and the Planner would minimize cost unbounded by any availability floor.

### Decision
1. **Metering is an event-sourced projection.** A **`MeteringView`** folds **usage/cost counters** from the event log HoBo already keeps — `deployment.*`, `run.*`, `resource.*`, `forge.*`, `token.*`, and egress ([Plan 12](../security-networking.md#plan-12)/[Plan 5](../reliability-observability-cost.md#plan-05)) — across a small dimension set: **control-plane operations, runtime-compute-seconds, storage-GB, egress-GB, and Forge-runs**. No new instrumentation; the view is auditable, replayable, and rebuildable from zero like every projection ([Plan 11](../event-model.md#plan-11)), so **every cost figure traces to facts**. The **Dispatcher**'s `CreditLedgerView` ([ADR-0071](05-config-matching-environments.md#adr-0071)) is the credit/budget-aware sibling of this view — it adds per-provider free-tier/promo/budget facts (`credit.*`) to derive an **effective marginal cost** for cost routing.
2. **Quotas + a runaway-spend circuit-breaker run through the policy plane.** A metered counter crossing a threshold produces a **`policy.Decided`** ([Plan 29](../contracts-policy-flags.md#plan-29)): **soft** → warn/alert obligation; **hard** → **deny at the gate** (block the spend-incurring action — deploy / agent provisioning / Forge run). Excess **spend *velocity*** trips a **durable spend circuit-breaker** — a saga obligation reusing the breaker pattern from [Plan 5](../reliability-observability-cost.md#plan-05) — that **halts spend-incurring actions until acknowledged/reset**. The existing **agent spend-caps** ([Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 5](../reliability-observability-cost.md#plan-05)) generalize to **tenant / Camp** quotas.
3. **Showback (cost attribution, not money).** Cost is attributed by the dimensions already in the event envelope — **tenant → Camp → Bindle → run/agent/team** — and surfaced as **showback** (visibility). The cost/showback/allocation abstraction is **modeled on the [OpenCost](https://opencost.io) open standard** (the CNCF cost-allocation spec) so figures are portable and interoperate with existing FinOps tooling rather than being a bespoke shape. It is OSS-core and self-hostable like the rest of the platform; there is no chargeback/invoicing.
4. **Cost is an availability lever: graceful degradation before hard-stop.** Cost controls **shed quality-of-service gracefully** rather than hard-stopping, and provisioning optimizes cost **within** an availability floor. A declarative **`costAvailabilityProfile`** per Camp/Bindle binds a budget to an availability target with ordered **degradation tiers**:
   ```ts
   costAvailability({
     budgetUsd: 5000,                 // period hard cap
     availabilitySlo: 0.999,          // nominal target ([ADR-0045](#adr-0045))
     tiers: [                         // entered as spend velocity approaches the cap
       { name: "nominal", upToBudgetFrac: 0.80, slo: 0.999 },
       { name: "reduced", upToBudgetFrac: 0.95, slo: 0.99,  shed: ["batch", "analytics"] },
       { name: "minimal", upToBudgetFrac: 1.00, slo: 0.95,  shed: ["non-critical"] },
     ],
     strategy: "shed-low-priority-first",   // | "degrade-all" | "fail-closed"
   })
   ```
   Resources/handlers carry a **`priority`/criticality** label (`critical`|`standard`|`low`); tiers shed lowest-priority load first. The `MeteringView` feeds **real-time spend velocity** into the policy plane, so a `policy.Decided` can ask *"at this velocity, do we cross tier N before period end?"* and yield `allow` (fits nominal) · **`allow-degraded`** + obligation (*"enter reduced tier; shed batch"*) · `deny`/`fail-closed` (would breach the hard cap). Crossing a tier is a **durable saga obligation, not a halt** (`spend.DegradationRequired`): the **SRE operator** ([Plan 40](../operators-sre.md#plan-40)) + runtime enforce it by composing existing levers — **scale-to-zero** non-critical workloads ([Plan 5](../reliability-observability-cost.md#plan-05) wasm economics), **feature-flag shed** ([Plan 29](../contracts-policy-flags.md#plan-29)), **cache-TTL increase / expensive-query shed**, **request-priority shedding** (an honest `503` + `Retry-After` to low-priority callers, never a silent hang), and **canary hold**. The **runaway-spend circuit-breaker (point 2) is the last resort** *after* graceful tiers are exhausted — degradation is the path *to* it, not a synonym for it; recovery emits `spend.DegradationRolledBack` when velocity falls. The Planner objective ([ADR-0033](05-config-matching-environments.md#adr-0033)) becomes *"minimize cost **subject to** the availability floor"* — the cheapest realization (provider/topology) that still meets `availabilitySlo`, with the cost **and** SLO rationale recorded in `match.Decided`/`deployment.Planned`. A cost-induced degradation is a first-class incident class ([Plan 40](../operators-sre.md#plan-40)): the SRE operator may *propose* cost-efficient remediation (*"hold 99% to stay under budget while the leak is fixed"*) as a gated obligation, and postmortem-by-replay shows exactly which load was shed and when.
5. **Events:** `spend.CircuitTripped` · `spend.CircuitReset` · `spend.DegradationRequired` · `spend.DegradationApplied` · `spend.DegradationRolledBack`. **Quota + degradation decisions ride the existing `policy.Decided`** + saga/obligation model (no new engine); metering itself is a projection (no per-usage events).

### Alternatives considered
- **A separate metering pipeline (independent instrumentation).** Rejected: duplicates what the log records and risks drift between "what happened" and "what was metered"; the projection is the source-of-truth-consistent answer.
- **A bespoke quota subsystem** separate from the policy plane. Rejected: duplicates the decision model + gates and splits "why was this blocked" across two systems.
- **Soft alerts only (no hard enforcement).** Rejected: no protection against runaway spend (a looping agent racking up cost).
- **Keep cost and availability independent.** Rejected: the breaker can cause the outage it's meant to prevent, and the Planner has no availability floor — the exact "availability through cost controls" gap.
- **Hard-stop on budget only (no degradation tiers).** Rejected: turns a cost event into a binary outage; tiers + priority shedding preserve critical traffic.
- **A new cost-degradation engine.** Rejected: reuse the policy plane (obligations), feature flags, the SRE operator, scale-to-zero, and the spend circuit-breaker — the cost↔availability link is a composition + schema, not new runtime.

### Consequences
- **(+)** The platform can meter, quota, protect against runaway spend, attribute cost, and **hold an availability target within a budget** — all from the existing log + policy plane, with auditable figures; agents/operators can target *"99.9% within $5k,"* and cost pressure degrades QoS gracefully instead of failing.
- **(+)** Reuses the event log/projection model ([Plan 11](../event-model.md#plan-11)), the policy plane + obligations ([Plan 29](../contracts-policy-flags.md#plan-29)), the circuit-breaker pattern ([Plan 5](../reliability-observability-cost.md#plan-05)), feature flags, the SRE operator, the Planner objective, and agent spend-caps ([Plan 6](../ai-native-agent-auth.md#plan-06)) — little new machinery (a projection + a profile + a Planner constraint + the `spend.*` events).
- **(+)** Honest failure modes (priority shedding + `503`+`Retry-After`) instead of silent hangs under budget pressure.
- **(−)** Metering fidelity depends on the cost-dimension model; mapping raw events → fair, intuitive counters is ongoing work.
- **(−)** A spend circuit-breaker that halts actions is a sharp safeguard, and tier thresholds + velocity windows need tuning to avoid false trips and flapping between tiers while still catching real runaways.
- **(−)** Degradation tiers + priority labels are new authoring surface; sensible defaults (one nominal tier, fail-closed) keep it optional.
