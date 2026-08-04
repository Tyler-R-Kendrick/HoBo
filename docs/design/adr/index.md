# Architecture Decision Records (ADR) — index

> Part of the [HoBo Design Plan Suite](../index.md). The load-bearing decisions, why they were made, and what they cost. Decisions are consolidated into **4 thematic decision docs**; each ADR is a section anchored `#adr-00xx`. ADRs are the things we should be deliberate about *unmaking*.

## How ADRs are numbered
- IDs are global and monotonic across the whole suite: `ADR-NNNN`.
- Each decision lives as a `## ADR-00xx` section inside one of the 4 theme docs below; link to it as `<theme>.md#adr-00xx`.
- Open/proposed-but-undecided items use `ADR-Pn` and are tracked in [`07-portability-extensibility.md`](./07-portability-extensibility.md#open--proposed-decisions-adr-pn).

## Theme docs
- [`01-architecture-core.md`](./01-architecture-core.md) — Architecture, runtime, config, matching & environments
- [`02-identity-security.md`](./02-identity-security.md) — Identity, security, governance & verification
- [`03-data-plane.md`](./03-data-plane.md) — Data plane, AI generation, agents & operators
- [`07-portability-extensibility.md`](./07-portability-extensibility.md) — Portability, extensibility, deployment topology & scope

## Standalone placement ADRs
- [`yard-first-placement.md`](./yard-first-placement.md) — Yard owns provider selection; Camp provider-neutral until attached; Camps movable via Trails (implemented)

## Index

| ID | Title | Theme doc |
|---|---|---|
| 0001 | WASM/WASI/WIT-native; TypeScript is the first reference implementation (Kubernetes optional; operator-configured IaC) | [architecture-core](01-architecture-core.md#adr-0001) |
| 0002 | Pluggable durable ports + a built-in engine (the Camp runtime) | [architecture-core](01-architecture-core.md#adr-0002) |
| 0003 | Event sourcing + CQRS (command store, actor-produced events, cached materializations) | [architecture-core](01-architecture-core.md#adr-0003) |
| 0004 | Choreography sagas + virtual actors for orchestration | [architecture-core](01-architecture-core.md#adr-0004) |
| 0005 | One ports/adapters shape for cloud, IaC & build (dagger-adjacent, wasm-on-OCI) | [architecture-core](01-architecture-core.md#adr-0005) |
| 0006 | IaC mechanism: pluggable adapters (Pulumi · Crossplane · Terraform · OpenTofu); Nix optional not default; per-resource stacks | [architecture-core](01-architecture-core.md#adr-0006) · [devx-devenv-nix](../devx-devenv-nix.md) |
| 0007 | Provider-specific options via an idiomatic typed-options builder (`.with(...)`) | [architecture-core](01-architecture-core.md#adr-0007) |
| 0008 | Keyless agent identity (SVID/OIDC federation) + token broker | [identity-security](02-identity-security.md#adr-0008) |
| 0009 | Capability Manifest capability/auth standard + Registry | [identity-security](02-identity-security.md#adr-0009) |
| 0010 | AI generation pipeline: providers/implementations generated + certified against conformance | [data-plane](03-data-plane.md#adr-0010) |
| 0011 | Scopes are first-class SDK objects (bindle/camp/yard/junction), not files | [architecture-core](01-architecture-core.md#adr-0011) |
| 0012 | Credential-scoped executors; isolation tier chosen per workload | [identity-security](02-identity-security.md#adr-0012) |
| 0014 | MCP as a first-class control surface | [data-plane](03-data-plane.md#adr-0014) |
| 0015 | Contracts & policy planes, the Gatekeeper gate & durable obligations | [identity-security](02-identity-security.md#adr-0015) |
| 0018 | Requirements-artifact structure & traceability scheme | [portability-extensibility](07-portability-extensibility.md#adr-0018) |
| 0019 | Persona prioritization / primary ICP | [portability-extensibility](07-portability-extensibility.md#adr-0019) |
| 0021 | NFR baselines / committed SLOs for v1 | [portability-extensibility](07-portability-extensibility.md#adr-0021) |
| 0023 | Security posture: secure-by-default, zero-trust, defense-in-depth | [identity-security](02-identity-security.md#adr-0023) |
| 0024 | Portability conformance guarantee ("same Bindle, N clouds") | [portability-extensibility](07-portability-extensibility.md#adr-0024) |
| 0025 | `"use training"` directive + `training-engine` behind a port (Agent Lightning / Trace optional, internal-only) | [data-plane](03-data-plane.md#adr-0025) |
| 0026 | Scope model: `Bindle ⊂ Camp ⊂ Yard ⊂ Junction` | [architecture-core](01-architecture-core.md#adr-0026) |
| 0027 | Secretless-first configuration & secrets | [identity-security](02-identity-security.md#adr-0027) |
| 0028 | Multi-Camp deployment model (cardinality, naming, atomicity) | [architecture-core](01-architecture-core.md#adr-0028) |
| 0031 | wasm host: self-hosted wasmCloud (default) · wasm-in-container floor · portability | [architecture-core](01-architecture-core.md#adr-0031) |
| 0032 | Data portability & schema-versioning strategy | [data-plane](03-data-plane.md#adr-0032) |
| 0033 | Deterministic Matching & Planner selection (+ default objective) | [architecture-core](01-architecture-core.md#adr-0033) |
| 0034 | Search is the query side of the data plane — not a primitive; vector/graph as opt-in packages | [data-plane](03-data-plane.md#adr-0034) |
| 0035 | Custom domains & DNS (Yard-level, per-Camp overrides) & multi-cloud ingress | [portability-extensibility](07-portability-extensibility.md#adr-0035) |
| 0036 | Air-gapped / sovereign Yard mode | [portability-extensibility](07-portability-extensibility.md#adr-0036) |
| 0037 | SDK codegen surface & policy | [architecture-core](01-architecture-core.md#adr-0037) |
| 0038 | End-user / application auth | [identity-security](02-identity-security.md#adr-0038) |
| 0039 | Metering, quota, cost attribution & cost-driven availability | [identity-security](02-identity-security.md#adr-0039) |
| 0040 | Cross-Camp stateful consistency | [architecture-core](01-architecture-core.md#adr-0040) |
| 0041 | Migration & onboarding (adopt-in-place) | [portability-extensibility](07-portability-extensibility.md#adr-0041) |
| 0042 | Local-dev fidelity (simulate / mock / Camp-only) | [portability-extensibility](07-portability-extensibility.md#adr-0042) |
| 0043 | The Junction: cross-cloud / hybrid federation of provider-specific Yards | [portability-extensibility](07-portability-extensibility.md#adr-0043) |
| 0044 | Feature flags & progressive delivery | [identity-security](02-identity-security.md#adr-0044) |
| 0045 | SLO-as-code, error-budget gating & alerting model | [identity-security](02-identity-security.md#adr-0045) |
| 0046 | Boundary standards: CloudEvents, OCSF & OTLP | [identity-security](02-identity-security.md#adr-0046) |
| 0047 | Chaos / continuous-resilience verification tier | [identity-security](02-identity-security.md#adr-0047) |
| 0048 | Persisted code-mutation mechanism (for `"use training"` promotion) | [data-plane](03-data-plane.md#adr-0048) |
| 0049 | Reserve "Hobo Code" for the configuration + code DSL | [architecture-core](01-architecture-core.md#adr-0049) |
| 0050 | Event-sourced data plane: reactor + streaming-first RX reads + projection sinks | [data-plane](03-data-plane.md#adr-0050) |
| 0051 | WIT records as the canonical domain schema (TS + protobuf + Zod generated) | [data-plane](03-data-plane.md#adr-0051) |
| 0052 | Projection-sink paradigm taxonomy & the reactivity boundary | [data-plane](03-data-plane.md#adr-0052) |
| 0053 | Write-side consistency: commands, aggregates, and the actor boundary | [data-plane](03-data-plane.md#adr-0053) |
| 0054 | Operator Agents (the Crew): built-in autonomous Yard services | [data-plane](03-data-plane.md#adr-0054) |
| 0055 | The generated stack: a layered model for AI generation/self-healing/persistence | [data-plane](03-data-plane.md#adr-0055) |
| 0056 | App/UI generation (design.md · OpenUI · json-render · mcp-apps · `ui-render`) | [data-plane](03-data-plane.md#adr-0056) |
| 0057 | Patchability & derivative upgrade paths (distinct from portability) | [portability-extensibility](07-portability-extensibility.md#adr-0057) |
| 0058 | SRE: incident management, runbooks & the self-healing decision model | [data-plane](03-data-plane.md#adr-0058) |
| 0059 | App communications: the `notify` family over the shared receiver port | [data-plane](03-data-plane.md#adr-0059) |
| 0060 | Compliance & data governance as a plane over the existing planes | [identity-security](02-identity-security.md#adr-0060) |
| 0061 | AI safety & model governance: registry, guardrails, red-teaming | [identity-security](02-identity-security.md#adr-0061) |
| 0062 | Registry distribution: publish/discover/install/trust over signed, certified artifacts | [portability-extensibility](07-portability-extensibility.md#adr-0062) |
| 0063 | Single scope: the whole designed surface ships together | [portability-extensibility](07-portability-extensibility.md#adr-0063) |
| 0064 | Scope: AI-native meta-cloud (remove business/monetization; keep app generation) | [portability-extensibility](07-portability-extensibility.md#adr-0064) |
| 0069 | The runtime & membrane: WIT-interface providers over wRPC, thin SDK | [architecture-core](01-architecture-core.md#adr-0069) |
| 0070 | Dev-mode auth bypass via integrated contract testing | [identity-security](02-identity-security.md#adr-0070) |
| 0071 | The Dispatcher: credit/budget-aware cost routing across registered providers (placement · dispatch · traffic) | [architecture-core](01-architecture-core.md#adr-0071) |
| 0072 | WIT-first SDK: a canonical `hobo:sdk` WIT package + conformance-gated per-language idiom layers | [architecture-core](01-architecture-core.md#adr-0072) |
| 0073 | Swappable integration ports: identity, artifacts, work-tracking & knowledge | [portability-extensibility](07-portability-extensibility.md#adr-0073) |
| 0074 | Org governance: RBAC + mandatory policy rules (deny-ceilings) over HoBo's own control-plane surface | [identity-security](02-identity-security.md#adr-0074) |
| 0075 | Interface stability tiers + statically-evaluable provider Capability Spec (preview `wasi:websocket`) | [portability-extensibility](07-portability-extensibility.md#adr-0075) |
| 0076 | Boundary virtualization: stub/link modes for request-level isolation, preview, self-healing & non-destructive chaos | [identity-security](02-identity-security.md#adr-0076) |
| 0077 | Projects & environments as grouping dimensions; the operations dashboard & per-project status pages | [identity-security](02-identity-security.md#adr-0077) |
| 0078 | Architecture-derived availability — the "march of the 9s" | [identity-security](02-identity-security.md#adr-0078) |
| 0079 | App multi-tenancy: the app-tenant model, tenancy-model spectrum & tenant lifecycle | [identity-security](02-identity-security.md#adr-0079) |
| 0080 | Tenant isolation by construction + the cross-tenant-leak conformance gate | [identity-security](02-identity-security.md#adr-0080) |
| 0081 | Encore-style paradigm resource packages as opt-in SDK plugins (SQL · vector · graph · document), mapped to cloud natives by Matching, overridable | [data-plane](03-data-plane.md#adr-0081) |
| 0082 | Golden Suites: reproducible default-on test/eval/benchmark gate for every deployment; failure → Incident → Crew → A2H handoff | [identity-security](02-identity-security.md#adr-0082) |
| 0083 | The Harness: progressive delivery as a pluggable core (OpenFeature · OpenDelivery · OpenExperiment, over OpenTelemetry) | [identity-security](02-identity-security.md#adr-0083) |
| 0084 | Cross-App Access (XAA): IdP-brokered, policy-governed user-delegated access to/from external apps (ID-JAG over token exchange) | [identity-security](02-identity-security.md#adr-0084) |
| 0085 | wRPC + WIT baseline: exact toolchain pins, vendored interface hashes, and preview upcasters | [architecture-core](01-architecture-core.md#adr-0085) |
| 0086 | Replay/live equivalence gate for deterministic materialization folds | [data-plane](03-data-plane.md#adr-0086) |
| 0087 | Package namespace ownership map | [architecture-core](01-architecture-core.md#adr-0087) |
| 0088 | Matching specificity vectors and catalog-hash tie attribution | [architecture-core](01-architecture-core.md#adr-0088) |
| 0089 | GraphQL facade generation boundary over materialization contracts | [data-plane](03-data-plane.md#adr-0089) |
| 0090 | Cross-cloud equivalence entries are provider-owned, registry-indexed, and resolved by a shared pure negotiation function | [architecture-core](01-architecture-core.md#adr-0090) |
| 0091 | Non-TS idiom layers start from reverse-extracted WIT plus a parity report | [architecture-core](01-architecture-core.md#adr-0091) |
| 0092 | Self-host bootstrap uses a disposable seed Yard and explicit Identity handover | [architecture-core](01-architecture-core.md#adr-0092) |
| 0093 | SDK semantics annex is a separate conformance lane from golden-IR lowering parity | [architecture-core](01-architecture-core.md#adr-0093) |
| 0094 | Autonomous-action safety rails: bounded blast radius, oscillation guards, and fail-closed A2H | [identity-security](02-identity-security.md#adr-0094) |
| 0095 | Distributed-artifact version resolution semantics | [portability-extensibility](07-portability-extensibility.md#adr-0095) |
| 0096 | Deny-ceiling composition algebra for mandatory policy packs | [identity-security](02-identity-security.md#adr-0096) |
| 0097 | ID-JAG threat model and draft-version tracking for Cross-App Access | [identity-security](02-identity-security.md#adr-0097) |
| 0098 | Generation eval methodology: hybrid rubrics, golden trajectories, and independent calibration | [data-plane](03-data-plane.md#adr-0098) |
| 0099 | Data-flywheel privacy model for trajectory capture and training | [data-plane](03-data-plane.md#adr-0099) |
| 0100 | SVID rotation under partition: signed renewal grace, then fail closed | [identity-security](02-identity-security.md#adr-0100) |
| 0101 | DNS validation-gate threat model: multi-vantage, TTL, ACME, health, and promote re-checks | [portability-extensibility](07-portability-extensibility.md#adr-0101) |
| 0102 | Opt-in component-host adapter certification target | [architecture-core](01-architecture-core.md#adr-0102) |
| 0103 | Junction connectivity inference is a pure Yard-manifest fold with mirrored halves | [portability-extensibility](07-portability-extensibility.md#adr-0103) |
| 0104 | SLO-gated rollback decisions use sustained evidence, not single-sample panic | [identity-security](02-identity-security.md#adr-0104) |
| 0105 | Componentize-js S0 stage gate: stable inputs digest + smoke + OCI manifest determinism; byte-identical wasm deferred | [architecture-core](01-architecture-core.md#adr-0105) |
| 0106 | Nomad evaluated & displaced: wasmCloud + Matching + Dispatcher subsume the scheduler pillar; Nomad = accepted-future deploy-target adapter | [architecture-core](01-architecture-core.md#adr-0106) |
| 0107 | Hosted-business commercialization records are design-scope productization; the product billing surface stays removed | [portability-extensibility](07-portability-extensibility.md#adr-0107) |
| 0108 | In-Camp workload scheduling: the component-host scheduler seam (wadm default; substrate-delegated) | [architecture-core](01-architecture-core.md#adr-0108) |
| 0109 | Polyglot inner loop: per-toolchain watch lanes, replay-based state preservation & OCI-fallback under `hobo dev` | [portability-extensibility](07-portability-extensibility.md#adr-0109) |
| 0110 | Marketplace payout-readiness is a launch-gated commercial-operations record, not reinstated monetization | [portability-extensibility](07-portability-extensibility.md#adr-0110) |
| 0111 | Local dashboard (`hobo dev`): co-launched read surface over `runtime-local`, not the Yard Gateway | [portability-extensibility](07-portability-extensibility.md#adr-0111) |
| 0112 | `hobo:data` is the canonical data() port; wasi:sql driver-level; retired SQL port; frozen proof alias | [data-plane](03-data-plane.md#adr-0112) |
| 0113 | Versioned managed secrets: `hobo:secrets` over `wasi:config/store` | [identity-security](02-identity-security.md#adr-0113) |
| 0114 | Route-level API security: per-route rules, middleware chain, and `hobo:http` enforcement | [identity-security](02-identity-security.md#adr-0114) |
| 0115 | FinOps advisory plane: cost anomaly detection, forecasting & rightsizing as deterministic MeteringView projections (advisory `cost.*` facts, gated proposals only) | [identity-security](02-identity-security.md#adr-0115) |
| 0116 | Productization release program: M0–M4 phase gates over the single designed scope | [portability-extensibility](07-portability-extensibility.md#adr-0116) |
| 0117 | FinOps operator (Crew cost specialist): advisory-only ownership of FinX outputs & commitment optimization | [data-plane](03-data-plane.md#adr-0117) |
| 0118 | App-facing `cache` port (`hobo:cache`): ephemeral, TTL-first, evictable — distinct from the durable `kv` store | [data-plane](03-data-plane.md#adr-0118) |
| 0119 | Realtime collaboration/presence composes from `websocket` rooms + reactor + `cache`; `@hobo/presence` stays an opt-in package | [data-plane](03-data-plane.md#adr-0119) |
| 0120 | API management (per-consumer keys, usage plans, dev catalog) is a composition over route security + policy + quotas; monetized API products out | [identity-security](02-identity-security.md#adr-0120) |
| 0121 | Built-in-engine consensus (ADR-P1): delegate to the substrate log/store by default; embedded library-Raft only for the self-host floor | [architecture-core](01-architecture-core.md#adr-0121) |
| 0122 | Cross-provider overlay mesh (ADR-P2): WireGuard portable default behind a `mesh` port; provider-native peering + managed meshes opt-in | [portability-extensibility](07-portability-extensibility.md#adr-0122) |
| 0123 | Durable-workflow authoring (ADR-P5): explicit `workflow`/`step` wrappers canonical; `"use workflow"` directive = shallow opt-in TS sugar | [architecture-core](01-architecture-core.md#adr-0123) |
| 0124 | In-Camp scheduling policies (ADR-P6/P7/P8): preemption/oversubscription/capacity-reservation as substrate-delegated per-Camp policy knobs | [architecture-core](01-architecture-core.md#adr-0124) |
| 0125 | Trainable-annotation surface v1: signature-only empty implementations, param/output metadata on the contract, optional decorator sugar; ax-backed built-in `training-engine` | [data-plane](03-data-plane.md#adr-0125) |
| 0126 | Committed platform entry files under `examples/*/deploy/` are the sanctioned JS-family exception (deploy artifacts ingested verbatim; sources stay TS-first) | [architecture-core](01-architecture-core.md#adr-0126) |
| 0127 | Lakebed accepted as a deploy-target adapter: honest-partial capabilities, deploy-driver realization, opt-in approval; rejected as a Yard substrate | [portability-extensibility](07-portability-extensibility.md#adr-0127) |
| 0128 | ts-autocode vendored as a git submodule (`external/ts-autocode`) linked into the pnpm workspace; trainable scanning/emission delegates upstream | [architecture-core](01-architecture-core.md#adr-0128) |
| 0129 | Provider-terms compliance: registered providers are the operator's own accounts; free-tier headroom is never pooled or resold; no account multiplication; adapters carry dated `terms` references | [portability-extensibility](07-portability-extensibility.md#adr-0129) |
| 0130 | DNS-valid hierarchical naming, optional portless local named endpoints, Tailscale-first managed overlay in `@hobo/connectivity`, pluggable public DNS, multi-tenant PolicyEngine + metering foundations | [portability-extensibility](07-portability-extensibility.md#adr-0130) |
| 0131 | Station as control-plane occupancy primitive; Broker pure Conductor; Rails as versioned profiles | [architecture-core](01-architecture-core.md#adr-0131) |
| 0132 | Continuous Identity Migration Plane: dual-path PrincipalRef continuity, Matching/policy-triggered, zero Bindle config | [identity-security](02-identity-security.md#adr-0132) |
| 0133 | Hard environment network isolation + optional Privileged Access Gateway | [identity-security](02-identity-security.md#adr-0133) |
| 0134 | HoBo Trails: app-owned continuous migration recipes that compose continuous identity | [identity-security](02-identity-security.md#adr-0134) |
| 0135 | SQLite is the default embedded EventStore/runtime journal behind HoBo ports; single-owner partitions; not the public portability boundary | [data-plane sqlite default](03-data-plane-sqlite-default.md) |
| 0136 | Effects on Contracts (Verse-inspired EffectSpec) + visible secondary ResilienceProfile; no Effect-TS/Polly/XState public deps | [data-plane effects+resiliency](03-data-plane-effects-resiliency.md) |
| 0137 | Session Replay on every App Kit (`@hobo/replay`); Kit ≠ WIT membrane; `replay.*`; dual fixtures; distinct from event-log replay | [data-plane](03-data-plane.md#adr-0137) |
| 0138 | Messaging plane unification; Kafka first-class capability provider; Dapr optional Camp runtime / ActorHost dual realization | [architecture-core](01-architecture-core.md#adr-0138) |
| 0139 | HoBo Code: coding harness and harness multiplexer (`hobo-code` / `@hobo/code`) | [data-plane](03-data-plane.md#adr-0139) |
| 0140 | Launch ship targets: OSS public (A), local-first developer tooling (B), hosted beta/GA (C); default order A→B→C; public claims must name target | [portability-extensibility](07-portability-extensibility.md#adr-0140) |
| 0141 | Canonical binding delivery membrane: WIT import → link → provider (no env-credential channel) | [identity-security](02-identity-security.md#adr-0141) |
| 0142 | Config as linked capability vs residual secrets; delegated refs and classification | [identity-security](02-identity-security.md#adr-0142) |
| 0143 | TrafficRouting port: portable multi-backend intent, explicit partial realization, Station synthesis, and optional provider adapters | [portability-extensibility](07-portability-extensibility.md#adr-0143) |
| 0144 | External-spec posture: Crossplane/OAM/CNAB mapped at the boundary, never depended on; Resource Definition versioning rules | [portability-extensibility](07-portability-extensibility.md#adr-0144) |
