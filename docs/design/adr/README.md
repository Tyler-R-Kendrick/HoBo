# Architecture Decision Records (ADR) — index

> Part of the [HoBo Design Plan Suite](../README.md). The load-bearing decisions, why they were made, and what they cost. Decisions are consolidated into **8 thematic decision docs**; each ADR is a section anchored `#adr-00xx`. ADRs are the things we should be deliberate about *unmaking*.

## How ADRs are numbered
- IDs are global and monotonic across the whole suite: `ADR-NNNN`.
- Each decision lives as a `## ADR-00xx` section inside one of the 8 theme docs below; link to it as `<theme>.md#adr-00xx`.
- Open/proposed-but-undecided items use `ADR-Pn` and are tracked in [`08-scope-and-requirements.md`](./08-scope-and-requirements.md#open--proposed-decisions-adr-pn).

## Theme docs
- [`01-architecture-core.md`](./01-architecture-core.md) — Core architecture, scope model & runtime substrate
- [`02-identity-security.md`](./02-identity-security.md) — Identity, security & secrets
- [`03-data-plane.md`](./03-data-plane.md) — Data plane, reactivity, schema & app capabilities
- [`04-governance-verification.md`](./04-governance-verification.md) — Governance, verification, SLO & cost
- [`05-config-matching-environments.md`](./05-config-matching-environments.md) — Config, matching, environments, codegen & DSL
- [`06-ai-generation-operators.md`](./06-ai-generation-operators.md) — AI generation, agents & operators
- [`07-portability-extensibility.md`](./07-portability-extensibility.md) — Portability, extensibility & deployment topology
- [`08-scope-and-requirements.md`](./08-scope-and-requirements.md) — Scope, requirements process & NFR baselines

## Index

| ID | Title | Theme doc |
|---|---|---|
| 0001 | TS-native control-plane core (Kubernetes optional) | [architecture-core](01-architecture-core.md#adr-0001) |
| 0002 | Pluggable durable ports + a built-in engine (the Camp runtime) | [architecture-core](01-architecture-core.md#adr-0002) |
| 0003 | Event sourcing + CQRS as the foundation | [architecture-core](01-architecture-core.md#adr-0003) |
| 0004 | Choreography sagas + virtual actors for orchestration | [architecture-core](01-architecture-core.md#adr-0004) |
| 0005 | One ports/adapters shape for cloud, IaC & build (dagger-adjacent, wasm-on-OCI) | [architecture-core](01-architecture-core.md#adr-0005) |
| 0006 | IaC mechanism: pluggable adapters (Pulumi · Crossplane · Terraform · OpenTofu); per-resource stacks | [architecture-core](01-architecture-core.md#adr-0006) |
| 0007 | Provider-specific options via an idiomatic typed-options builder (`.with(...)`) | [architecture-core](01-architecture-core.md#adr-0007) |
| 0008 | Keyless agent identity (SVID/OIDC federation) + token broker | [identity-security](02-identity-security.md#adr-0008) |
| 0009 | Capability Manifest capability/auth standard + Registry | [identity-security](02-identity-security.md#adr-0009) |
| 0010 | Forge: generation pipeline (inputs + algorithm) gated by conformance | [ai-generation-operators](06-ai-generation-operators.md#adr-0010) |
| 0011 | Scopes are first-class SDK objects (bindle/camp/yard/junction), not files | [architecture-core](01-architecture-core.md#adr-0011) |
| 0012 | Credential-scoped executors; isolation tier chosen per workload | [identity-security](02-identity-security.md#adr-0012) |
| 0014 | MCP as a first-class control surface | [ai-generation-operators](06-ai-generation-operators.md#adr-0014) |
| 0015 | Contracts & policy planes, the Gatekeeper gate & durable obligations | [governance-verification](04-governance-verification.md#adr-0015) |
| 0018 | Requirements-artifact structure & traceability scheme | [scope-and-requirements](08-scope-and-requirements.md#adr-0018) |
| 0019 | Persona prioritization / primary ICP | [scope-and-requirements](08-scope-and-requirements.md#adr-0019) |
| 0021 | NFR baselines / committed SLOs for v1 | [scope-and-requirements](08-scope-and-requirements.md#adr-0021) |
| 0023 | Security posture: secure-by-default, zero-trust, defense-in-depth | [identity-security](02-identity-security.md#adr-0023) |
| 0024 | Portability conformance guarantee ("same Bindle, N clouds") | [portability-extensibility](07-portability-extensibility.md#adr-0024) |
| 0025 | `"use training"` directive + `training-engine` behind a port (Agent Lightning / Trace optional, internal-only) | [ai-generation-operators](06-ai-generation-operators.md#adr-0025) |
| 0026 | Scope model: `Bindle ⊂ Camp ⊂ Yard ⊂ Junction` | [architecture-core](01-architecture-core.md#adr-0026) |
| 0027 | Secretless-first configuration & secrets | [identity-security](02-identity-security.md#adr-0027) |
| 0028 | Multi-Camp deployment model (cardinality, naming, atomicity) | [config-matching-environments](05-config-matching-environments.md#adr-0028) |
| 0031 | wasm host of record, runtime substrate & component-host portability | [architecture-core](01-architecture-core.md#adr-0031) |
| 0032 | Data portability & schema-versioning strategy | [data-plane](03-data-plane.md#adr-0032) |
| 0033 | Deterministic Matching & Planner selection (+ default objective) | [config-matching-environments](05-config-matching-environments.md#adr-0033) |
| 0034 | Generalized, extensible search capability (vector/graph as extensions) | [data-plane](03-data-plane.md#adr-0034) |
| 0035 | Custom domains & DNS (Yard-level, per-Camp overrides) & multi-cloud ingress | [portability-extensibility](07-portability-extensibility.md#adr-0035) |
| 0036 | Air-gapped / sovereign Yard mode | [portability-extensibility](07-portability-extensibility.md#adr-0036) |
| 0037 | SDK codegen surface & policy | [config-matching-environments](05-config-matching-environments.md#adr-0037) |
| 0038 | End-user / application auth | [identity-security](02-identity-security.md#adr-0038) |
| 0039 | Metering, quota, cost attribution & cost-driven availability | [governance-verification](04-governance-verification.md#adr-0039) |
| 0040 | Cross-Camp stateful consistency | [config-matching-environments](05-config-matching-environments.md#adr-0040) |
| 0041 | Migration & onboarding (adopt-in-place) | [portability-extensibility](07-portability-extensibility.md#adr-0041) |
| 0042 | Local-dev fidelity (simulate / mock / Camp-only) | [portability-extensibility](07-portability-extensibility.md#adr-0042) |
| 0043 | The Junction: cross-cloud / hybrid federation of provider-specific Yards | [portability-extensibility](07-portability-extensibility.md#adr-0043) |
| 0044 | Feature flags & progressive delivery | [governance-verification](04-governance-verification.md#adr-0044) |
| 0045 | SLO-as-code, error-budget gating & alerting model | [governance-verification](04-governance-verification.md#adr-0045) |
| 0046 | Boundary standards: CloudEvents, OCSF & OTLP | [governance-verification](04-governance-verification.md#adr-0046) |
| 0047 | Chaos / continuous-resilience verification tier | [governance-verification](04-governance-verification.md#adr-0047) |
| 0048 | Persisted code-mutation mechanism (for `"use training"` promotion) | [ai-generation-operators](06-ai-generation-operators.md#adr-0048) |
| 0049 | Reserve "Hobo Code" for the configuration + code DSL | [config-matching-environments](05-config-matching-environments.md#adr-0049) |
| 0050 | Event-sourced data plane: reactor + streaming-first RX reads + projection sinks | [data-plane](03-data-plane.md#adr-0050) |
| 0051 | WIT records as the canonical domain schema (TS + protobuf + Zod generated) | [data-plane](03-data-plane.md#adr-0051) |
| 0052 | Projection-sink paradigm taxonomy & the reactivity boundary | [data-plane](03-data-plane.md#adr-0052) |
| 0053 | Write-side consistency: commands, aggregates, and the actor boundary | [data-plane](03-data-plane.md#adr-0053) |
| 0054 | Operator Agents (the Crew): built-in autonomous Yard services | [ai-generation-operators](06-ai-generation-operators.md#adr-0054) |
| 0055 | The generated stack: a layered model for AI generation/self-healing/persistence | [ai-generation-operators](06-ai-generation-operators.md#adr-0055) |
| 0056 | App/UI generation (design.md · OpenUI · json-render · mcp-apps · `ui-render`) | [ai-generation-operators](06-ai-generation-operators.md#adr-0056) |
| 0057 | Patchability & derivative upgrade paths (distinct from portability) | [portability-extensibility](07-portability-extensibility.md#adr-0057) |
| 0058 | SRE: incident management, runbooks & the self-healing decision model | [ai-generation-operators](06-ai-generation-operators.md#adr-0058) |
| 0059 | App communications: the `notify` family over the shared receiver port | [data-plane](03-data-plane.md#adr-0059) |
| 0060 | Compliance & data governance as a plane over the existing planes | [governance-verification](04-governance-verification.md#adr-0060) |
| 0061 | AI safety & model governance: registry, guardrails, red-teaming | [governance-verification](04-governance-verification.md#adr-0061) |
| 0062 | Registry distribution: publish/discover/install/trust over signed, certified artifacts | [portability-extensibility](07-portability-extensibility.md#adr-0062) |
| 0063 | Single scope: the whole designed surface ships together | [scope-and-requirements](08-scope-and-requirements.md#adr-0063) |
| 0064 | Scope: AI-native meta-cloud (remove business/monetization; keep app generation) | [scope-and-requirements](08-scope-and-requirements.md#adr-0064) |
| 0069 | The runtime & membrane: WIT-interface providers over wRPC, thin SDK | [architecture-core](01-architecture-core.md#adr-0069) |
| 0070 | Dev-mode auth bypass via integrated contract testing | [identity-security](02-identity-security.md#adr-0070) |
