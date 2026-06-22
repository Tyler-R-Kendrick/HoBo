# Plan 18 — Architecture Decision Record (ADR) log

> Part of the [HoBo Design Plan Suite](./README.md). The load-bearing decisions, why they were made, and what they cost. Format: Status · Context · Decision · Consequences. These are the things we should be deliberate about *unmaking*.
>
> **Convention (from ADR-0018):** new ADRs are now written **one file per decision** under [`adr/`](./adr/README.md). ADR-0001…0017 below remain the canonical record for those decisions; the [ADR index](./adr/README.md) gives a single chronological view including ADR-0018+ (the requirements decision log).

### ADR-0001 — TS-native control-plane core (Kubernetes optional)
**Status:** Accepted. **Context:** the control plane could be built on Kubernetes/Crossplane or as a bespoke TS service. **Decision:** TS-native core (actor runtime + Pulumi Automation API); Crossplane is one optional execution adapter. **Consequences:** maximal TS cohesion + self-host simplicity; we own reconciliation/HA we'd otherwise inherit from k8s ([Plan 4](./04-control-plane.md), [Plan 5](./05-reliability-ha.md)).

### ADR-0002 — Pluggable durable ports + a built-in engine (the Camp runtime)
**Status:** Accepted. **Context:** adopt one durable engine (Temporal/Restate) vs define our own ports. **Decision:** HoBo defines runtime ports (EventStore+Queue+Streamer+ActorHost+Clock), provided per Camp, and ships a built-in engine plus adapters. **Consequences:** portability + no hard dependency; we must build/maintain the built-in engine and a conformance suite for the runtime ports ([Plan 2](./02-sdk-api.md)).

### ADR-0003 — Event sourcing + CQRS as the foundation
**Status:** Accepted. **Context:** state-based store vs event log. **Decision:** append-only event log is the single source of truth for both planes. **Consequences:** free replay/audit/time-travel and recovery; cost is CQRS discipline, projections, and schema upcasting ([Plan 11](./11-event-model.md)).

### ADR-0004 — Choreography sagas + virtual actors for orchestration
**Status:** Accepted. **Context:** central orchestrator vs choreography. **Decision:** per-resource virtual actors (grains) reconciling desired↔actual, coordinating via events; compensation by choreography. **Consequences:** no coordinator SPOF, natural parallelism, per-resource isolation; harder "see the whole flow" — mitigated by the DeploymentView projection ([Plan 4](./04-control-plane.md)).

### ADR-0005 — One ports/adapters shape for cloud, IaC, and build/VM
**Status:** Accepted. **Decision:** `CloudProvider`, `IacProvider`, `BuildProvider` are all swappable ports; a cloud provider composes the other two. **Consequences:** uniform extensibility (incl. Forge); a provider must implement more surface to be "complete" ([Plan 3](./03-providers-iac.md)).

### ADR-0006 — Pulumi Automation API as the primary IaC mechanism
**Status:** Accepted. **Context:** Pulumi vs CDKTF (sunset) vs raw Terraform/OpenTofu. **Decision:** Pulumi Automation API primary (embeddable, TS-native); Crossplane for k8s substrate; OpenTofu for HCL; CDKTF import-only. **Consequences:** real-language compositions, no CLI shell-out; Pulumi runtime dependency in the default path ([Plan 3](./03-providers-iac.md)).

### ADR-0007 — Provider-specific options via typed `.with(...)`
**Status:** Accepted. **Decision:** optimization is additive, per-provider-typed, and inert for non-resolved providers, so one Bindle targets many clouds unedited; `require`/`prefer` controls strictness. **Consequences:** the agnostic promise + escape hatch coexist; provider packages must export accurate option types ([Plan 2](./02-sdk-api.md)).

### ADR-0008 — Keyless agent identity (SVID/OIDC federation) + token broker
**Status:** Accepted. **Context:** static keys vs federated identity. **Decision:** agents get short-lived SVIDs; the broker exchanges them for resource-scoped provider tokens (OIDC federation preferred, OAuth-OBO for human delegation). **Consequences:** no static secrets, full credential audit; we must run an OIDC IdP + per-provider trust setup ([Plan 6](./06-ai-native-agent-auth.md), [Plan 12](./12-security-multitenancy.md)).

### ADR-0009 — Hobo Code capability/auth standard + Registry
**Status:** Accepted. **Decision:** providers publish machine-readable signs (`capabilities/auth/cost.json`) at a well-known path; the Registry indexes them. **Consequences:** agents self-discover + self-provision; we must define, version, and possibly standardize the schema ([Plan 6](./06-ai-native-agent-auth.md)).

### ADR-0010 — Forge: AI-generated providers gated by conformance
**Status:** Accepted (ambitious). **Decision:** generate candidate providers from docs/OpenAPI/TF, certify via sandboxed conformance tests, sign + publish. **Consequences:** breaks the community-bottleneck on provider breadth; relies on a strong conformance suite as the trust boundary ([Plan 6](./06-ai-native-agent-auth.md), [Plan 9](./09-verification-open-questions.md)).

### ADR-0011 — `bindle.ts` (what) vs `hobo.config.ts` (where/how)
**Status:** Accepted. **Decision:** app topology is provider-agnostic and separate from the mapping/config that names providers. **Consequences:** clean review boundaries; swapping clouds touches only config ([Plan 15](./15-cli-dx.md)).

### ADR-0012 — Firecracker-sandboxed, credential-scoped executors
**Status:** Accepted. **Decision:** all IaC/build runs in microVMs with no ambient creds and a single scoped token. **Consequences:** strong isolation for untrusted/generated provider code; operational cost of running a microVM fleet ([Plan 4](./04-control-plane.md), [Plan 12](./12-security-multitenancy.md)).

### ADR-0013 — Per-resource IaC stacks (default)
**Status:** Accepted. **Decision:** each resource owns an isolated IaC stack. **Consequences:** blast-radius isolation + clean compensation; more state objects to manage ([Plan 3](./03-providers-iac.md)).

### ADR-0014 — MCP as a first-class control surface
**Status:** Accepted. **Decision:** every CLI/SDK capability has an MCP equivalent with the same identity model. **Consequences:** agents are true operators; we maintain a third interface surface in lockstep ([Plan 6](./06-ai-native-agent-auth.md), [Plan 15](./15-cli-dx.md)).

### ADR-0015 — Contracts & policy are HoBo-native planes; engines sit behind ports
**Status:** Accepted. **Decision:** consumer-driven contracts/compatibility ([Plan 29](./29-contracts-compatibility.md)) and policy decisions ([Plan 30](./30-policy-plane.md)) are first-class, with `contract-engine`/`policy-engine` as **WIT ports** whose default impls are built-in HoBo engines; **Pact/OPA/Cedar are optional providers**, never dependencies or the conceptual model. **Consequences:** no hard dep; HoBo owns the Contract/Policy IR; ecosystems integrate via adapters. (Resolves ADR-P3 — policy default is **typed TypeScript**.)

### ADR-0016 — A single `can-deploy`/Gatekeeper gate composes all checks
**Status:** Accepted. **Decision:** deployability = contracts-compatible AND policy-allows/approves AND eval-gates-pass AND conformance AND within-cost AND signed/attested, evaluated at Delta→Set/promote and surfaced as `hobo verify` ([Plan 29](./29-contracts-compatibility.md)/[Plan 26](./26-environments-deltas.md)). **Consequences:** one explainable, event-sourced decision instead of scattered CI gates.

### ADR-0017 — Policy obligations are durable effects, not advice
**Status:** Accepted. **Decision:** an "allow but require X" obligation (canary/approval/auth/shadow-eval) is realized as a HoBo effect/saga and tracked `ObligationCreated→Satisfied`; an unmet obligation blocks ([Plan 30](./30-policy-plane.md)/[Plan 5](./05-reliability-ha.md)). **Consequences:** governance is enforced by construction, fully auditable.

## Open / proposed (not yet decided)
- **ADR-P1:** consensus for the built-in engine (own Raft vs delegate to the Camp's runtime store) — [Plan 5](./05-reliability-ha.md).
- **ADR-P2:** overlay-mesh technology for cross-provider connectivity — [Plan 13](./13-networking-connectivity.md).
- **ADR-P3:** ~~policy language for guardrails/ABAC~~ — **Resolved by ADR-0015** (typed TS default; OPA/Cedar optional providers behind the `policy-engine` port).
- **ADR-P4:** ~~default Planner objective (cost-first vs latency-first)~~ — **Resolved by [ADR-0033](./adr/ADR-0033-deterministic-matching-and-planner-selection.md)**: configurable `cost`|`latency`|`single-provider`|`carbon`, **default min-cost within constraints**, applied as a deterministic lexicographic tiebreak (no on-path solver/LLM) — [Plan 16](./16-cost-finops.md)/[Plan 25](./25-resource-definitions-matching.md).
- **ADR-P5:** documented default for the workflow directive vs wrapper (compiler transform depth) — [Plan 2](./02-sdk-api.md).
