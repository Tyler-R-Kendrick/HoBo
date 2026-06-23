# Core architecture, scope model & runtime substrate — consolidated decisions

> Consolidated ADR decisions for **core architecture, scope model & runtime substrate**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0001
**TS-native control-plane core (Kubernetes optional).**

**Context:** the control plane could be built on Kubernetes/Crossplane or as a bespoke TS service. **Decision:** TS-native core (actor runtime + Pulumi Automation API); Crossplane is one optional execution adapter. **Consequences:** maximal TS cohesion + self-host simplicity; we own reconciliation/HA we'd otherwise inherit from k8s ([Plan 4](../control-plane.md#plan-04), [Plan 5](../reliability-observability-cost.md#plan-05)).

## ADR-0002
**Pluggable durable ports + a built-in engine (the Camp runtime).**

**Context:** adopt one durable engine (Temporal/Restate) vs define our own ports. **Decision:** HoBo defines runtime ports (EventStore+Queue+Streamer+ActorHost+Clock), provided per Camp, and ships a built-in engine plus adapters. The capability/resource surface targets **parity with Nitric and Vercel** — APIs, schedules, AI, websites, storage, secrets/config, databases/caching, messaging, feature flags, and functions/workflows — all expressed as resources behind ports ([Plan 21](../authoring-resources-wiring.md#plan-21)). **Consequences:** portability + no hard dependency; we must build/maintain the built-in engine and a conformance suite for the runtime ports ([Plan 2](../sdk-api.md#plan-02)).

## ADR-0003
**Event sourcing + CQRS as the foundation.**

**Context:** state-based store vs event log. **Decision:** append-only event log is the single source of truth for both planes. **Consequences:** free replay/audit/time-travel and recovery; cost is CQRS discipline, projections, and schema upcasting ([Plan 11](../event-model.md#plan-11)).

## ADR-0004
**Choreography sagas + virtual actors for orchestration.**

**Context:** central orchestrator vs choreography. **Decision:** per-resource virtual actors (grains) reconciling desired↔actual, coordinating via events; compensation by choreography. **Consequences:** no coordinator SPOF, natural parallelism, per-resource isolation; harder "see the whole flow" — mitigated by the DeploymentView projection ([Plan 4](../control-plane.md#plan-04)).

## ADR-0005
**One ports/adapters shape for cloud, IaC, and build/VM.**

**Decision:** `CloudProvider`, `IacProvider`, `BuildProvider` are all swappable ports; a cloud provider composes the other two. The default **`BuildProvider` is a dagger-adjacent programmable build engine** — a DAG of containerized build steps — that **packages wasm components as OCI images by default (wasm-on-OCI)**, so `addContainer(...)` both wires *and builds* the container from one syntax. **Consequences:** uniform extensibility (incl. Forge); one build mechanism for wasm-first and container workloads; a provider must implement more surface to be "complete" ([Plan 3](../control-plane.md#plan-03)).

## ADR-0006
**IaC mechanism: pluggable adapters (Pulumi · Crossplane · Terraform · OpenTofu); no single primary.**

**Decision:** the `IacProvider` port ships first-class built-in adapters for **Pulumi (Automation API), Crossplane, Terraform, and OpenTofu** out of the box — none is "the primary." A self-hosted deployment **configures which IaC provider(s) it uses**, and the choice can be made per-workload / per-Camp via Matching ([ADR-0033](05-config-matching-environments.md#adr-0033)). Adapters are **distributed and consumed like plugins from an external git registry**, and the port is **extensible using git repositories as importable modules**, so new IaC backends and shared modules install without forking HoBo. **Consequences:** real-language compositions (Pulumi/TS), HCL ecosystems (Terraform/OpenTofu), and k8s control planes (Crossplane) coexist behind one port; HoBo maintains the adapter contract + conformance suite, not a favored engine ([Plan 3](../control-plane.md#plan-03)).

## ADR-0007
**Provider-specific options via an idiomatic typed-options builder (`.with(...)`).**

**Decision:** per-provider optimization is additive, typed, and inert for non-resolved providers, so one Bindle targets many clouds unedited; `require`/`prefer` controls strictness. Provider options use an **idiomatic typed-options builder pattern** — the same shape .NET uses for middleware/service configuration (`addX(options => { … })` with a strongly-typed, per-provider options object) — so options are discoverable, validated, and composable. **Consequences:** the agnostic promise + escape hatch coexist; provider packages must export accurate typed option builders ([Plan 2](../sdk-api.md#plan-02)).

## ADR-0011
**Scopes are first-class SDK objects (`bindle`/`camp`/`yard`/`junction`), not config files.**

**Decision:** the four scopes are constructed and composed **programmatically in the SDK**, not declared in separate `*.config.ts` files. `bindle(name)` declares the provider-agnostic app (`.addContainer(...)`, abstract deps); `camp(name)` imports Bindles and maps them to one provider's resources (`camp.import(app)`); `yard(name, provider)` groups Camps under one provider and holds cross-Camp policy/gateways (`yard.setup(camp1, camp2)`); `junction(name)` connects Yards across clouds (`junction.add(azureYard, awsYard)`). The objects **are** the topology; config is data on them, not a parallel file. **Consequences:** one composable, typed, testable surface; the Bindle stays provider-agnostic while Camp/Yard/Junction carry provider + cross-cloud specifics ([Plan 2](../sdk-api.md#plan-02)/[Plan 15](../developer-experience.md#plan-15)).

## ADR-0013
**Per-resource IaC stacks (default).**

**Decision:** each resource owns an isolated IaC stack. **Consequences:** blast-radius isolation + clean compensation; more state objects to manage ([Plan 3](../control-plane.md#plan-03)).

## ADR-0026
**Scope model: `Bindle ⊂ Camp ⊂ Yard ⊂ Junction`.**

### Decision
Four nested scopes, each owning a distinct kind of "what varies":

1. **Bindle = the app, provider-agnostic.** App-level abstractions only — service boundaries and **abstract dependencies** (a SQL/data store, a message bus, a bucket) — with **no cloud-provider specifics**. A Bindle deploys *into* Camps unchanged.
2. **Camp = a provider-specific deployment target (≈ a Pulumi stack).** It maps the Bindle's abstract deps onto **one provider's** concrete resources in one provider-specific grouping (e.g. an Azure resource group in one region); two Camps can be the same Bindle on the same provider but differ by group/region. A Camp **provides the durable runtime** (EventStore + Queue + Streamer + ActorHost + Clock, behind the `Runtime` interface; built-in `runtime-local`, backends `runtime-postgres`/`-temporal`/`-restate`/`-cloudflare`) and carries **camp-local networking constraints**.
3. **Yard = cross-Camp scope, still provider-specific.** A Yard groups Camps under **one** provider and applies **cross-Camp constraints**: policies, provider-global networking (e.g. a vWAN), and global gateways (e.g. Azure Front Door). It runs the control plane for its provider.
4. **Junction = cross-cloud / hybrid.** A Junction connects **Yards** (each provider-specific) for multi-cloud and hybrid scenarios — federating trust + signed artifacts + cross-cloud policy, never a shared-state controller ([ADR-0043](07-portability-extensibility.md#adr-0043)).

**Environments are a matching dimension, not a layer** — a Camp carries an `environment type` ([Plan 25](../platform-engineering.md#plan-25)/[Plan 26](../platform-engineering.md#plan-26)).

**WIT interface** is the WebAssembly Component Model term ([Plan 20](../wasm-runtime-wit.md#plan-20)/[Plan 24](../wasm-runtime-wit.md#plan-24)) — the contract shape for ports.

### Consequences
- **(+)** Each level maps to a real concern: portable app (Bindle) / provider stack (Camp ≈ Pulumi stack) / provider-global cross-Camp policy + gateways (Yard) / cross-cloud + hybrid (Junction).
- **(+)** Multi-region within a provider = several Camps under one Yard; multi-cloud = several Yards under a Junction — no overloaded noun.
- **(+)** Cross-cloud is an explicit first-class scope (the Junction), not a property smuggled into the control plane.

## ADR-0031
**wasm host of record & runtime substrate.**

### Context
[Plan 20](../wasm-runtime-wit.md#plan-20) commits HoBo to **wasm-first, OCI-container fallback**, with WIT interfaces as the port contracts and late-bound **links** binding a component's imports to a provider's exports. The **host of record** — *what actually executes components* locally and in prod — must be concrete for the "any language, one artifact, runs anywhere" claim to hold and for [ADR-0026](#adr-0026)'s "a Camp selects its runtime backend" to have an answer at the wasm execution layer.

### Decision
1. **The wasm host is a port, not a mandate.** Introduce a **`component-host`** capability/port (the WASI interface impls + the link table + the component lifecycle). The host is a **property of a Camp** ([ADR-0026](#adr-0026)) — a Camp selects its `component-host` the same way it independently selects its runtime backend and infra Provider. Camps stay heterogeneous ([ADR-0028](05-config-matching-environments.md#adr-0028)): one Camp may run SpinKube while another runs provider-native.
2. **v1 prod default = wasm-in-container.** The portable default runs the component host **inside an OCI container**, reusing the **existing OCI/container fallback pipeline** ([Plan 22](../authoring-resources-wiring.md#plan-22)) — so "runs anywhere a container runs" holds with **zero new mandatory infra**. This is the floor every Camp can rely on.
3. **Higher-capability hosts are opt-in adapters** behind the same port, chosen per Camp: **SpinKube / containerd-wasm** (k8s-native, shim-level density), **wasmCloud lattice** (cross-host late-bound links + multi-region link migration), **provider-native wasm targets** (e.g. a cloud's first-class wasm runtime). Each is certified against the `component-host` conformance suite ([Plan 9](../verification.md#plan-09)) — the same trust boundary as any other adapter.
4. **Local/dev + the `runtime-local` host = Wasmtime.** The canonical Bytecode Alliance Component-Model engine is the host of record for `hobo dev` and the built-in runtime, so **local semantics match prod** (the in-container default also embeds Wasmtime). **jco-in-Node is rejected** as the dev host — a second, divergent wasm semantics surface would undermine dev/prod parity.
5. **One conformance boundary.** A `component-host` adapter may only be selected by a Camp if it passes the host conformance suite (WASI interface fidelity, link-table semantics, deny-by-default capability enforcement, deterministic Clock for replay). This is identical in spirit to provider/runtime-port conformance ([Plan 9](../verification.md#plan-09)).

### Alternatives considered
- **Mandate a single host everywhere (e.g. SpinKube/K8s).** Rejected: couples HoBo to Kubernetes, breaks "the host is a Camp property" ([ADR-0026](#adr-0026)), and excludes non-K8s and edge Camps. Contradicts the ports/adapters spine.
- **wasmCloud lattice as the v1 default.** Rejected *as the default* (kept as an opt-in adapter): its late-bound cross-host links + multi-region are genuinely powerful, but it is heavy new infra + operational surface to require for every Camp in v1. Make portability the default; make power opt-in.
- **jco-in-Node for the local host.** Rejected: convenient for a JS shop but a second wasm semantics surface vs Wasmtime in prod; "works on `hobo dev`" would stop predicting "works in a Camp."
- **No abstraction — just pick one host and hard-wire it.** Rejected: the entire Plan 20 model is link-based ports/adapters; the host must be swappable like every other capability, or multi-cloud/edge heterogeneity breaks.

### Consequences
- **(+)** Q10 is answered concretely: the default substrate is **wasm-in-container** (runs anywhere a container runs), with denser/feature-richer hosts available per Camp — "wasm-first to prod" is now demonstrable, not aspirational.
- **(+)** Reuses the existing OCI pipeline ([Plan 22](../authoring-resources-wiring.md#plan-22)) + the conformance boundary ([Plan 9](../verification.md#plan-09)) + the Firecracker sandbox model ([ADR-0012](02-identity-security.md#adr-0012)); the default needs **no new infra**.
- **(+)** Dev/prod parity: Wasmtime locally and in the in-container default means one semantics surface; component cold-start stays ms-scale, improving failover/rollback windows ([Plan 5](../reliability-observability-cost.md#plan-05)).
- **(+)** Camps remain heterogeneous ([ADR-0028](05-config-matching-environments.md#adr-0028)); a regulated/edge Camp can pick a different host than a cloud Camp under the same Yard.
- **(−)** Several host adapters = more conformance surface to build and maintain; the in-container default carries a small overhead vs a bare wasm runtime (an accepted price for portability).
- **(−)** Advanced lattice features (cross-host late-bound links, live multi-region link migration) live in the **wasmCloud adapter**, not the v1 default — apps that need them must select that host per Camp.

## ADR-0067
**Component-host portability: conformance + version pinning across hosts.**

### Context
[ADR-0031](#adr-0031) makes the **`component-host`** a per-Camp port with several implementations — **Wasmtime** locally, **wasm-in-container** as the portable v1 prod default, **SpinKube / wasmCloud-lattice / provider-native** as opt-in adapters. [ADR-0024](07-portability-extensibility.md#adr-0024) commits to portability across **durable-store runtime backends** (EventStore/Queue/…) but says nothing about portability across **component-hosts**. Different hosts can silently diverge on the exact properties HoBo's guarantees depend on: deterministic **Clock**/replay semantics ([Plan 11](../event-model.md#plan-11)), `wasi:*` interface fidelity, **link** late-binding semantics, and **capability-handle** deny-by-default isolation ([Plan 20](../wasm-runtime-wit.md#plan-20)). A component proven on Wasmtime locally must behave identically on wasm-in-container in prod — today that's assumed, not gated.

### Decision
Make the component-host a **conformance-gated, version-pinned** portability boundary, exactly like provider ports.

1. **`@hobo/conformance/component-host` suite** ([Plan 9](../verification.md#plan-09)). Any host claiming conformance must pass: **deterministic-clock trace replay** (same run → identical state across hosts), **`wasi:*` interface round-trip** (vendored/pinned interfaces behave identically), **link semantics** (imported-interface → provider-export late-binding resolves the same), and **capability-handle isolation** (deny-by-default; an un-linked capability call fails). A host may only be selected for a Camp if it passes.
2. **Host version pinned in the manifest IR** ([Plan 22](../authoring-resources-wiring.md#plan-22)). A Bindle records the `component-host` kind + version it was built/certified against; a Camp whose host is incompatible fails planning with a precise reason (mirrors the `wasi:*`/runtime version policy in [ADR-0024](07-portability-extensibility.md#adr-0024) §5). Host upgrades go through an explicit, gated path with an **upcaster** where semantics change — **no silent rewrite** of component behavior.
3. **Cross-host E2E** folded into the portability example. The `multi-cloud-shop` E2E ([ADR-0024](07-portability-extensibility.md#adr-0024)) is extended so the same component runs on **Wasmtime local → wasm-in-container → (opt-in) SpinKube** with identical behavior under trace replay. Host-specific capabilities (e.g. wasmCloud lattice link-migration) are typed as host-`.with()` options, inert on hosts that don't offer them, and flagged by `hobo doctor` as host lock-in (same model as provider `.with()`).

### Alternatives considered
- **Assume host equivalence (status quo).** Rejected: silent divergence in clock/WASI/link/capability semantics breaks replay determinism — a hard invariant ([ADR-0024](07-portability-extensibility.md#adr-0024)).
- **Single mandated host.** Rejected: contradicts [ADR-0031](#adr-0031)'s per-Camp host choice + air-gap/provider-native needs.
- **Pin host but no conformance.** Rejected: pinning prevents accidental swaps but doesn't prove a *claimed* host is actually equivalent — conformance is the trust boundary.

### Consequences
- **(+)** "wasm-first, runs anywhere a container runs" is now *verified*, not asserted; the deterministic-replay invariant holds across hosts.
- **(+)** Host portability reuses the existing conformance + version-policy machinery — a new suite + a manifest field, not new architecture.
- **(−)** Authoring the host conformance suite (esp. deterministic-clock + WASI fidelity assertions) is real work; v1 ships the suite + Wasmtime/wasm-in-container reference passes, with SpinKube/wasmCloud as opt-in certified adapters.
- **(−)** Host-`.with()` options reintroduce a (typed, flagged) lock-in surface; mitigated by `hobo doctor` + the portability report ([ADR-0024](07-portability-extensibility.md#adr-0024)).

## ADR-0069
**The runtime & membrane: WIT-interface providers over wRPC, wrapped by a thin SDK.**

### Context
Nitric proves the "runtime + membrane + provider" shape: app code calls an SDK → a local **runtime/membrane** (Nitric uses **gRPC**) → a **provider plugin** (written in **Go**) that implements each building block against a specific cloud. HoBo wants Nitric's full building-block runtime, but realized natively on the WebAssembly **Component Model** rather than on a language-specific plugin SDK and a hand-rolled gRPC wire. The pieces already exist — WIT ports ([Plan 24](../wasm-runtime-wit.md#plan-24)), late-bound **links**, the `component-host` ([ADR-0031](#adr-0031)) — so the membrane should be the component model, not a parallel mechanism.

### Decision
1. **The runtime provides a full building-block set (Nitric parity), each as a WIT interface** ([Plan 24](../wasm-runtime-wit.md#plan-24)): APIs/HTTP, schedules, topics & subscriptions (pub/sub), queues, key/value, storage/blob, secrets, SQL, and websockets — alongside HoBo's own durable workflow/actors, reactive materializations, auth, and AI/training. A "building block" is just a **port** ([ADR-0005](#adr-0005)).
2. **Providers implement the WIT interfaces directly — not a Go/TS plugin SDK.** A provider is a WASM **component** (or WIT-conformant adapter) that *exports* the building-block interfaces; there is no HoBo-specific provider language or plugin API to learn — the contract **is** the WIT world, and the Forge can generate it ([ADR-0010](06-ai-generation-operators.md#adr-0010)/[ADR-0030](06-ai-generation-operators.md#adr-0030)). This is the key departure from Nitric's per-language provider plugins.
3. **The membrane is wRPC, not plain gRPC.** App-component imports are bound to provider-component exports by **links** and invoked over **wRPC** (wasmCloud's WIT-native RPC; transport-agnostic, NATS by default), so the same WIT contract drives in-process, cross-process, and cross-host (lattice) invocation — consistent with the `component-host` adapters ([ADR-0031](#adr-0031), incl. the wasmCloud-lattice host). No separate IDL or hand-maintained protobuf: the wire is generated from WIT.
4. **A thin SDK wraps the runtime.** The TS SDK ([Plan 2](../sdk-api.md#plan-02)) is ergonomic sugar over the generated WIT bindings — typed clients for the runtime's imported interfaces. It holds **no cloud logic**; all behavior lives behind the WIT ports in the runtime + providers, so the SDK stays small and every language with a Component-Model binding can host the same app.
5. **Deny-by-default is structural.** An imported interface with no link / no `.allow()` grant cannot be invoked — wRPC only routes linked interfaces and capability handles are deny-by-default ([ADR-0023](02-identity-security.md#adr-0023)/[Plan 21](../authoring-resources-wiring.md#plan-21)). Capability is granted by linking, not by ambient reachability.
6. **The contract is WIT/WASM, not a language.** The entire programmable surface — Bindles, services, providers — targets the Component Model and runs on wasmCloud; HoBo requires **WIT + WASM**, with **TypeScript as the first reference implementation, not a requirement**. Any language with a Component-Model toolchain authors against the same WIT worlds.

### Alternatives considered
- **Plain gRPC membrane (Nitric's choice).** Rejected: not WIT-native — needs a separate `.proto` IDL + codegen parallel to WIT, and a non-component wire that breaks the "one contract = the WIT world" model. wRPC gives the same RPC ergonomics generated straight from WIT.
- **Language-specific provider plugin SDK (Go/TS).** Rejected: forces a provider author into one language and a bespoke plugin API, and fragments the trust/conformance boundary. Requiring providers to code against the **WIT interface** makes the Component Model the single contract and lets the Forge generate providers.
- **A fat SDK with cloud logic.** Rejected: re-introduces per-cloud code on the client, breaking portability and the thin-client model; the SDK must be a typed shell over the runtime.

### Consequences
- **(+)** One contract everywhere: a building block is a WIT interface, a provider is a WIT component, the wire is wRPC generated from that WIT — local dev, cross-process, and lattice all use the same mechanism ([ADR-0031](#adr-0031)).
- **(+)** Provider breadth via the Component Model + Forge, with no language lock-in for provider authors; conformance ([Plan 9](../verification.md#plan-09)) is the single trust boundary.
- **(+)** Thin SDK → small client, easy multi-language hosting, and deny-by-default falls out of linking.
- **(−)** wRPC is younger than gRPC; HoBo pins/vendors its wRPC + WIT versions ([ADR-0067](#adr-0067)) and ships a conformance suite for the membrane.
- **(−)** "Everything is a WIT interface" demands disciplined interface design + versioning ([ADR-0024](07-portability-extensibility.md#adr-0024)); the building-block WIT set is now a maintained public contract.
