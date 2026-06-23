# Core architecture, scope model & runtime substrate — consolidated decisions

> Consolidated ADR decisions for **core architecture, scope model & runtime substrate**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0001
**TS-native control-plane core (Kubernetes optional).**

**Context:** the control plane could be built on Kubernetes/Crossplane or as a bespoke TS service. **Decision:** TS-native core (actor runtime + Pulumi Automation API); Crossplane is one optional execution adapter. **Consequences:** maximal TS cohesion + self-host simplicity; we own reconciliation/HA we'd otherwise inherit from k8s ([Plan 4](../04-control-plane.md), [Plan 5](../05-reliability-ha.md)).

## ADR-0002
**Pluggable durable ports + a built-in engine (the Camp runtime).**

**Context:** adopt one durable engine (Temporal/Restate) vs define our own ports. **Decision:** HoBo defines runtime ports (EventStore+Queue+Streamer+ActorHost+Clock), provided per Camp, and ships a built-in engine plus adapters. **Consequences:** portability + no hard dependency; we must build/maintain the built-in engine and a conformance suite for the runtime ports ([Plan 2](../02-sdk-api.md)).

## ADR-0003
**Event sourcing + CQRS as the foundation.**

**Context:** state-based store vs event log. **Decision:** append-only event log is the single source of truth for both planes. **Consequences:** free replay/audit/time-travel and recovery; cost is CQRS discipline, projections, and schema upcasting ([Plan 11](../11-event-model.md)).

## ADR-0004
**Choreography sagas + virtual actors for orchestration.**

**Context:** central orchestrator vs choreography. **Decision:** per-resource virtual actors (grains) reconciling desired↔actual, coordinating via events; compensation by choreography. **Consequences:** no coordinator SPOF, natural parallelism, per-resource isolation; harder "see the whole flow" — mitigated by the DeploymentView projection ([Plan 4](../04-control-plane.md)).

## ADR-0005
**One ports/adapters shape for cloud, IaC, and build/VM.**

**Decision:** `CloudProvider`, `IacProvider`, `BuildProvider` are all swappable ports; a cloud provider composes the other two. **Consequences:** uniform extensibility (incl. Forge); a provider must implement more surface to be "complete" ([Plan 3](../03-providers-iac.md)).

## ADR-0006
**Pulumi Automation API as the primary IaC mechanism.**

**Context:** Pulumi vs CDKTF (sunset) vs raw Terraform/OpenTofu. **Decision:** Pulumi Automation API primary (embeddable, TS-native); Crossplane for k8s substrate; OpenTofu for HCL; CDKTF import-only. **Consequences:** real-language compositions, no CLI shell-out; Pulumi runtime dependency in the default path ([Plan 3](../03-providers-iac.md)).

## ADR-0007
**Provider-specific options via typed `.with(...)`.**

**Decision:** optimization is additive, per-provider-typed, and inert for non-resolved providers, so one Bindle targets many clouds unedited; `require`/`prefer` controls strictness. **Consequences:** the agnostic promise + escape hatch coexist; provider packages must export accurate option types ([Plan 2](../02-sdk-api.md)).

## ADR-0011
**`bindle.ts` (what) vs `hobo.config.ts` (where/how).**

**Decision:** app topology is provider-agnostic and separate from the mapping/config that names providers. **Consequences:** clean review boundaries; swapping clouds touches only config ([Plan 15](../15-cli-dx.md)).

## ADR-0013
**Per-resource IaC stacks (default).**

**Decision:** each resource owns an isolated IaC stack. **Consequences:** blast-radius isolation + clean compensation; more state objects to manage ([Plan 3](../03-providers-iac.md)).

## ADR-0026
**Scope model: `Yard ⊃ Camp ⊃ Bindle`; remove "World".**

- **Origin:** product direction — clarify the configuration layers and drop a vendor-branded concept.

### Context
Two problems with the prior vocabulary:
1. **"World"** (the durable-runtime substrate: EventStore/Queue/Streamer/ActorHost/Clock) was lifted from Vercel's Workflow SDK. Carrying a competitor's brand for a core HoBo concept is both a positioning liability and conceptually redundant now that Camps are becoming provider-specific.
2. **"Camp"** was overloaded as "an environment (dev/prod)" while also being the thing that selected a runtime + a provider mapping. There was no single, named scope for **cross-provider / cross-cloud / hybrid** policy and topology, even though the Yard (control plane) already operated across providers.

### Decision
Adopt three explicitly nested scopes — **`Yard ⊃ Camp ⊃ Bindle`** — and remove the "World" noun:

1. **Bindle = app-level config.** Provider-agnostic topology + bindings. Unchanged. Deployed *into* Camps.
2. **Camp = provider-specific deployment target.** One environment on one provider/cloud (e.g. `prod-aws`). A Camp now **also provides the durable runtime** — the ports formerly grouped as "World" become **runtime ports** the Camp supplies (built-in `runtime-local`; backends `runtime-postgres`/`-temporal`/`-restate`/`-cloudflare`). "World" is **folded into Camp**; the `World` interface becomes `Runtime`; `@hobo/world-*` packages become `@hobo/runtime-*`.
3. **Yard = control plane + broadest scope.** Keeps its role as the orchestrator **and** becomes the explicit holder of **cross-provider / cross-cloud / hybrid** policy + topology, governing many Camps. A multi-cloud `production` is several Camps under one Yard.

**Environments stay a matching dimension, not a new layer.** A Camp carries an `environment type` ([Plan 25](../25-resource-definitions-matching.md)/[Plan 26](../26-environments-deltas.md)); "prod across two clouds" = two Camps under a Yard. No fourth noun.

**Preserve "WIT interface"** — that is the WebAssembly Component Model term ([Plan 20](../20-wasm-wasi-runtime.md)/[Plan 24](../24-wit-interfaces-reference.md)) and is unrelated to the removed Vercel concept.

> **Above the Yard (rare, a later v1 iteration):** the Yard remains the broadest scope **for an app/org**. For the extreme-isolation case where wholly separate Yards must interoperate, an optional **peer-federation** aggregate — the **`Junction`** — sits over sovereign Yards ([ADR-0043](07-portability-extensibility.md#adr-0043)); it federates trust + signed artifacts, is **not** a controller, and does **not** make the Yard subordinate. Default deployments never see it.

### Alternatives considered
- **Keep "World" as the runtime substrate noun** — rejected: vendor-branded, and redundant once a Camp is provider-specific and naturally owns its runtime.
- **Rename the control-plane orchestrator and make "Yard" only a config scope** — rejected: more churn for no gain; the orchestrator already spans providers, so "Yard = control plane + broad scope" is the natural, least-disruptive reading.
- **Introduce a 4th "Environment" layer (`Yard ⊃ Environment ⊃ Camp ⊃ Bindle`)** — rejected for v1: environments are already handled by the matching dimension (Plan 25); a 4th noun adds ceremony without a concrete need. Revisit if multi-env-per-provider grouping proves painful.

### Consequences
- **(+)** A clean, teachable hierarchy (governed-how-across-clouds / where-on-which-provider / what-the-app-is); HoBo owns its runtime concept end-to-end; no Vercel-brand dependency.
- **(+)** Cross-provider/hybrid governance has a home (the Yard) that matches how the control plane already works.
- **(−)** A broad terminology sweep across the suite (`World`→Camp/runtime; `@hobo/world-*`→`@hobo/runtime-*`), with care to preserve "WIT interface". Tracked + verified by grep in the refactor.
- **(−)** `ADR-0002`'s wording ("Worlds") is now historical; this ADR supersedes its naming (the *decision* — pluggable durable ports + built-in engine — stands).

## ADR-0031
**wasm host of record & runtime substrate.**

- **Origin:** the gap analysis flagged that **every competitor has a clear runtime substrate** (containers/K8s/their cloud) while HoBo's was an open iteration hook (Q10) — leaving "wasm-first" unproven for production. Designed via brainstorming + grill-with-docs.

### Context
[Plan 20](../20-wasm-wasi-runtime.md) commits HoBo to **wasm-first, OCI-container fallback**, with WIT interfaces as the port contracts and late-bound **links** binding a component's imports to a provider's exports. But it left the **host of record** — *what actually executes components* locally and in prod — as a "TBD" iteration hook (Wasmtime vs jco-in-Node for local; SpinKube/containerd-wasm vs wasmCloud lattice vs wasm-in-container vs provider-native for prod). Until that is decided, the "any language, one artifact, runs anywhere" claim has no concrete substrate, and [ADR-0026](#adr-0026)'s "a Camp selects its runtime backend" has no answer for the wasm execution layer.

### Decision
1. **The wasm host is a port, not a mandate.** Introduce a **`component-host`** capability/port (the WASI interface impls + the link table + the component lifecycle). The host is a **property of a Camp** ([ADR-0026](#adr-0026)) — a Camp selects its `component-host` the same way it independently selects its runtime backend and infra Provider. Camps stay heterogeneous ([ADR-0028](05-config-matching-environments.md#adr-0028)): one Camp may run SpinKube while another runs provider-native.
2. **v1 prod default = wasm-in-container.** The portable default runs the component host **inside an OCI container**, reusing the **existing OCI/container fallback pipeline** ([Plan 22](../22-wiring-manifest.md)) — so "runs anywhere a container runs" holds with **zero new mandatory infra**. This is the floor every Camp can rely on.
3. **Higher-capability hosts are opt-in adapters** behind the same port, chosen per Camp: **SpinKube / containerd-wasm** (k8s-native, shim-level density), **wasmCloud lattice** (cross-host late-bound links + multi-region link migration), **provider-native wasm targets** (e.g. a cloud's first-class wasm runtime). Each is certified against the `component-host` conformance suite ([Plan 9](../09-verification-open-questions.md)) — the same trust boundary as any other adapter.
4. **Local/dev + the `runtime-local` host = Wasmtime.** The canonical Bytecode Alliance Component-Model engine is the host of record for `hobo dev` and the built-in runtime, so **local semantics match prod** (the in-container default also embeds Wasmtime). **jco-in-Node is rejected** as the dev host — a second, divergent wasm semantics surface would undermine dev/prod parity.
5. **One conformance boundary.** A `component-host` adapter may only be selected by a Camp if it passes the host conformance suite (WASI interface fidelity, link-table semantics, deny-by-default capability enforcement, deterministic Clock for replay). This is identical in spirit to provider/runtime-port conformance ([Plan 9](../09-verification-open-questions.md)).

### Alternatives considered
- **Mandate a single host everywhere (e.g. SpinKube/K8s).** Rejected: couples HoBo to Kubernetes, breaks "the host is a Camp property" ([ADR-0026](#adr-0026)), and excludes non-K8s and edge Camps. Contradicts the ports/adapters spine.
- **wasmCloud lattice as the v1 default.** Rejected *as the default* (kept as an opt-in adapter): its late-bound cross-host links + multi-region are genuinely powerful, but it is heavy new infra + operational surface to require for every Camp in v1. Make portability the default; make power opt-in.
- **jco-in-Node for the local host.** Rejected: convenient for a JS shop but a second wasm semantics surface vs Wasmtime in prod; "works on `hobo dev`" would stop predicting "works in a Camp."
- **No abstraction — just pick one host and hard-wire it.** Rejected: the entire Plan 20 model is link-based ports/adapters; the host must be swappable like every other capability, or multi-cloud/edge heterogeneity breaks.

### Consequences
- **(+)** Q10 is answered concretely: the default substrate is **wasm-in-container** (runs anywhere a container runs), with denser/feature-richer hosts available per Camp — "wasm-first to prod" is now demonstrable, not aspirational.
- **(+)** Reuses the existing OCI pipeline ([Plan 22](../22-wiring-manifest.md)) + the conformance boundary ([Plan 9](../09-verification-open-questions.md)) + the Firecracker sandbox model ([ADR-0012](02-identity-security.md#adr-0012)); the default needs **no new infra**.
- **(+)** Dev/prod parity: Wasmtime locally and in the in-container default means one semantics surface; component cold-start stays ms-scale, improving failover/rollback windows ([Plan 5](../05-reliability-ha.md)).
- **(+)** Camps remain heterogeneous ([ADR-0028](05-config-matching-environments.md#adr-0028)); a regulated/edge Camp can pick a different host than a cloud Camp under the same Yard.
- **(−)** Several host adapters = more conformance surface to build and maintain; the in-container default carries a small overhead vs a bare wasm runtime (an accepted price for portability).
- **(−)** Advanced lattice features (cross-host late-bound links, live multi-region link migration) live in the **wasmCloud adapter**, not the v1 default — apps that need them must select that host per Camp.

## ADR-0067
**Component-host portability: conformance + version pinning across hosts.**

### Context
[ADR-0031](#adr-0031) makes the **`component-host`** a per-Camp port with several implementations — **Wasmtime** locally, **wasm-in-container** as the portable v1 prod default, **SpinKube / wasmCloud-lattice / provider-native** as opt-in adapters. [ADR-0024](07-portability-extensibility.md#adr-0024) commits to portability across **durable-store runtime backends** (EventStore/Queue/…) but says nothing about portability across **component-hosts**. Different hosts can silently diverge on the exact properties HoBo's guarantees depend on: deterministic **Clock**/replay semantics ([Plan 11](../11-event-model.md)), `wasi:*` interface fidelity, **link** late-binding semantics, and **capability-handle** deny-by-default isolation ([Plan 20](../20-wasm-wasi-runtime.md)). A component proven on Wasmtime locally must behave identically on wasm-in-container in prod — today that's assumed, not gated.

### Decision
Make the component-host a **conformance-gated, version-pinned** portability boundary, exactly like provider ports.

1. **`@hobo/conformance/component-host` suite** ([Plan 9](../09-verification-open-questions.md)). Any host claiming conformance must pass: **deterministic-clock trace replay** (same run → identical state across hosts), **`wasi:*` interface round-trip** (vendored/pinned interfaces behave identically), **link semantics** (imported-interface → provider-export late-binding resolves the same), and **capability-handle isolation** (deny-by-default; an un-linked capability call fails). A host may only be selected for a Camp if it passes.
2. **Host version pinned in the manifest IR** ([Plan 22](../22-wiring-manifest.md)). A Bindle records the `component-host` kind + version it was built/certified against; a Camp whose host is incompatible fails planning with a precise reason (mirrors the `wasi:*`/runtime version policy in [ADR-0024](07-portability-extensibility.md#adr-0024) §5). Host upgrades go through an explicit, gated path with an **upcaster** where semantics change — **no silent rewrite** of component behavior.
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
