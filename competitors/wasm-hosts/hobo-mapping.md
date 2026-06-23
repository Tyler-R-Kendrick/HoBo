# Wasm-hosts → HoBo mapping (ADR-0031 stress-test)

> Part of the [wasm-hosts reference](./README.md). Maps the landscape onto HoBo's `component-host` port + links, and stress-tests whether [ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031)'s adapter set holds up. Verdict: **it does — validated, with two concrete refinements.**

| Landscape concept | HoBo equivalent | Verdict |
|---|---|---|
| **Wasmtime** (Component-Model engine) | local/dev `component-host` + the engine inside the wasm-in-container default ([ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031)) | ✅ exact match |
| **wasm-in-container via containerd shim (runwasi)** | **v1 prod default** `component-host` (reuses the OCI pipeline) | ✅ validated; pin **runwasi** as the mechanism |
| **SpinKube** (Spin operator + containerd shim + runtime-class-mgr) | **k8s-native `component-host` adapter** | ✅ real system = the named adapter |
| **wasmCloud lattice + capability providers + wRPC links** | **lattice `component-host` adapter** + HoBo **links** / **capability providers** ([Plan 20](../../docs/design/wasm-runtime-wit.md#plan-20)) | ✅ HoBo's model *is* this; pin **wRPC/NATS** as cross-host link transport |
| **WIT contracts** across all hosts | HoBo WIT ports ([Plan 24](../../docs/design/wasm-runtime-wit.md#plan-24)) | ✅ same standard |
| **WASI component portable across hosts** | "one component, many `component-host` adapters" ([ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031)) | ✅ directly evidenced |
| **deny-by-default capability security** | `.allow()` → link enforcement ([Plan 21](../../docs/design/authoring-resources-wiring.md#plan-21)/[Plan 20](../../docs/design/wasm-runtime-wit.md#plan-20)) | ✅ same property |
| **~1 ms / ~10 MB cold start** | cost/density + failover-speed claims ([Plan 16](../../docs/design/reliability-observability-cost.md#plan-16)/[Plan 5](../../docs/design/reliability-observability-cost.md#plan-05)) | ✅ numbers grounded |
| *(provider-native wasm targets, e.g. cloud wasm runtimes)* | provider-native `component-host` adapter ([ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031)) | ✅ adapter slot exists |

## ADR-0031 stress-test verdict
**Holds up.** Every adapter ADR-0031 names corresponds to a real, production system: **Wasmtime** (local + in-container engine), **SpinKube/containerd** (k8s-native), **wasmCloud lattice** (cross-host links + migration), provider-native. The "one component, many hosts behind a `component-host` port" thesis is exactly what WASI-http portability across Wasmtime/Spin/SpinKube/NGINX-Unit already demonstrates.

## Two concrete refinements for HoBo (the analysis payoff)
1. **Pin `runwasi` (containerd shim) as the integration mechanism** for both the **wasm-in-container default** and the **SpinKube adapter** — don't invent a bespoke shim. *(Sharpens [ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031).)*
2. **Pin `wRPC` (WIT-over-RPC) over the lattice as the cross-host link transport** for the **wasmCloud-lattice adapter** (and thus for [ADR-0040](../../docs/design/adr/05-config-matching-environments.md#adr-0040)'s cross-host link migration); inherits a **NATS** operational dependency. *(Sharpens [ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031)/[ADR-0040](../../docs/design/adr/05-config-matching-environments.md#adr-0040).)*

Both refinements are **iteration-hook-level** (no decision reversal). They're recorded here rather than reopening the ADRs, per the "don't churn accepted ADRs for hooks" norm — and noted as Plan 20 iteration hooks.
