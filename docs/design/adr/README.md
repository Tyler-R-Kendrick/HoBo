# Architecture Decision Records (ADR) — index

> Part of the [HoBo Design Plan Suite](../README.md). The load-bearing decisions, why they were made, and what they cost. Decisions are consolidated into **4 thematic decision docs**; each ADR is a section anchored `#adr-00xx`. ADRs are the things we should be deliberate about *unmaking*.

## How ADRs are numbered
- IDs are global and monotonic across the whole suite: `ADR-NNNN`.
- Each decision lives as a `## ADR-00xx` section inside one of the 4 theme docs below; link to it as `<theme>.md#adr-00xx`.
- Open/proposed-but-undecided items use `ADR-Pn` and are tracked in [`07-portability-extensibility.md`](./07-portability-extensibility.md#open--proposed-decisions-adr-pn).

## Theme docs
- [`01-architecture-core.md`](./01-architecture-core.md) — Architecture, runtime, config, matching & environments
- [`02-identity-security.md`](./02-identity-security.md) — Identity, security, governance & verification
- [`03-data-plane.md`](./03-data-plane.md) — Data plane, AI generation, agents & operators
- [`07-portability-extensibility.md`](./07-portability-extensibility.md) — Portability, extensibility, deployment topology & scope

## Index

| ID | Title | Theme doc |
|---|---|---|
| 0001 | WASM/WASI/WIT-native; TypeScript is the first reference implementation (Kubernetes optional; operator-configured IaC) | [architecture-core](01-architecture-core.md#adr-0001) |
| 0002 | Pluggable durable ports + a built-in engine (the Camp runtime) | [architecture-core](01-architecture-core.md#adr-0002) |
| 0003 | Event sourcing + CQRS (command store, actor-produced events, cached materializations) | [architecture-core](01-architecture-core.md#adr-0003) |
| 0004 | Choreography sagas + virtual actors for orchestration | [architecture-core](01-architecture-core.md#adr-0004) |
| 0005 | One ports/adapters shape for cloud, IaC & build (dagger-adjacent, wasm-on-OCI) | [architecture-core](01-architecture-core.md#adr-0005) |
| 0006 | IaC mechanism: pluggable adapters (Pulumi · Crossplane · Terraform · OpenTofu); per-resource stacks | [architecture-core](01-architecture-core.md#adr-0006) |
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
| 0096 | Deny-ceiling composition algebra for mandatory policy packs | [identity-security](02-identity-security.md#adr-0096) |
