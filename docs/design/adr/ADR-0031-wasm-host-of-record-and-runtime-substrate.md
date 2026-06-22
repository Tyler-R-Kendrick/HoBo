# ADR-0031 — wasm host of record & runtime substrate

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 20 — WASM/WASI runtime](../20-wasm-wasi-runtime.md) · [Plan 5 — Reliability/HA](../05-reliability-ha.md) · [Plan 9 — Verification](../09-verification-open-questions.md) (conformance) · [Plan 22 — Wiring/manifest](../22-wiring-manifest.md) (OCI pipeline) · [ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md) (host is a property of a Camp) · [ADR-0028](./ADR-0028-multi-camp-deployment-model.md) (multi-Camp) · [ADR-0012](./README.md) (Firecracker-sandboxed executors) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (Q10 / "wasm to prod")
- **Origin:** the gap analysis flagged that **every competitor has a clear runtime substrate** (containers/K8s/their cloud) while HoBo's was an open iteration hook (Q10) — leaving "wasm-first" unproven for production. Designed via brainstorming + grill-with-docs.

## Context
[Plan 20](../20-wasm-wasi-runtime.md) commits HoBo to **wasm-first, OCI-container fallback**, with WIT interfaces as the port contracts and late-bound **links** binding a component's imports to a provider's exports. But it left the **host of record** — *what actually executes components* locally and in prod — as a "TBD" iteration hook (Wasmtime vs jco-in-Node for local; SpinKube/containerd-wasm vs wasmCloud lattice vs wasm-in-container vs provider-native for prod). Until that is decided, the "any language, one artifact, runs anywhere" claim has no concrete substrate, and [ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md)'s "a Camp selects its runtime backend" has no answer for the wasm execution layer.

## Decision
1. **The wasm host is a port, not a mandate.** Introduce a **`component-host`** capability/port (the WASI interface impls + the link table + the component lifecycle). The host is a **property of a Camp** ([ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md)) — a Camp selects its `component-host` the same way it independently selects its runtime backend and infra Provider. Camps stay heterogeneous ([ADR-0028](./ADR-0028-multi-camp-deployment-model.md)): one Camp may run SpinKube while another runs provider-native.
2. **v1 prod default = wasm-in-container.** The portable default runs the component host **inside an OCI container**, reusing the **existing OCI/container fallback pipeline** ([Plan 22](../22-wiring-manifest.md)) — so "runs anywhere a container runs" holds with **zero new mandatory infra**. This is the floor every Camp can rely on.
3. **Higher-capability hosts are opt-in adapters** behind the same port, chosen per Camp: **SpinKube / containerd-wasm** (k8s-native, shim-level density), **wasmCloud lattice** (cross-host late-bound links + multi-region link migration), **provider-native wasm targets** (e.g. a cloud's first-class wasm runtime). Each is certified against the `component-host` conformance suite ([Plan 9](../09-verification-open-questions.md)) — the same trust boundary as any other adapter.
4. **Local/dev + the `runtime-local` host = Wasmtime.** The canonical Bytecode Alliance Component-Model engine is the host of record for `hobo dev` and the built-in runtime, so **local semantics match prod** (the in-container default also embeds Wasmtime). **jco-in-Node is rejected** as the dev host — a second, divergent wasm semantics surface would undermine dev/prod parity.
5. **One conformance boundary.** A `component-host` adapter may only be selected by a Camp if it passes the host conformance suite (WASI interface fidelity, link-table semantics, deny-by-default capability enforcement, deterministic Clock for replay). This is identical in spirit to provider/runtime-port conformance ([Plan 9](../09-verification-open-questions.md)).

## Alternatives considered
- **Mandate a single host everywhere (e.g. SpinKube/K8s).** Rejected: couples HoBo to Kubernetes, breaks "the host is a Camp property" ([ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md)), and excludes non-K8s and edge Camps. Contradicts the ports/adapters spine.
- **wasmCloud lattice as the v1 default.** Rejected *as the default* (kept as an opt-in adapter): its late-bound cross-host links + multi-region are genuinely powerful, but it is heavy new infra + operational surface to require for every Camp in v1. Make portability the default; make power opt-in.
- **jco-in-Node for the local host.** Rejected: convenient for a JS shop but a second wasm semantics surface vs Wasmtime in prod; "works on `hobo dev`" would stop predicting "works in a Camp."
- **No abstraction — just pick one host and hard-wire it.** Rejected: the entire Plan 20 model is link-based ports/adapters; the host must be swappable like every other capability, or multi-cloud/edge heterogeneity breaks.

## Consequences
- **(+)** Q10 is answered concretely: the default substrate is **wasm-in-container** (runs anywhere a container runs), with denser/feature-richer hosts available per Camp — "wasm-first to prod" is now demonstrable, not aspirational.
- **(+)** Reuses the existing OCI pipeline ([Plan 22](../22-wiring-manifest.md)) + the conformance boundary ([Plan 9](../09-verification-open-questions.md)) + the Firecracker sandbox model ([ADR-0012](./README.md)); the default needs **no new infra**.
- **(+)** Dev/prod parity: Wasmtime locally and in the in-container default means one semantics surface; component cold-start stays ms-scale, improving failover/rollback windows ([Plan 5](../05-reliability-ha.md)).
- **(+)** Camps remain heterogeneous ([ADR-0028](./ADR-0028-multi-camp-deployment-model.md)); a regulated/edge Camp can pick a different host than a cloud Camp under the same Yard.
- **(−)** Several host adapters = more conformance surface to build and maintain; the in-container default carries a small overhead vs a bare wasm runtime (an accepted price for portability).
- **(−)** Advanced lattice features (cross-host late-bound links, live multi-region link migration) live in the **wasmCloud adapter**, not the v1 default — apps that need them must select that host per Camp.
