# Wasm hosting landscape — competitor/grounding reference

> A capture of the **WebAssembly component hosting** landscape — **Wasmtime**, **Fermyon Spin / SpinKube**, and **wasmCloud** — that directly grounds HoBo's most novel infra bet: **wasm-first** with a **`component-host` port** ([ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031)) and the **links** model ([Plan 20](../../docs/design/20-wasm-wasi-runtime.md)). Sources: [wasmcloud.com/docs](https://wasmcloud.com/docs/concepts/) · [spinkube.dev](https://www.spinkube.dev/) · [fermyon.com](https://www.fermyon.com/) · [WebAssembly Component Model]. Excerpts quoted for analysis (see [`../README.md`](../README.md#sources--fair-use)).

## Why this is here
HoBo's runtime substrate ([Plan 20](../../docs/design/20-wasm-wasi-runtime.md)) is **WASI components behind WIT ports, late-bound by links** — a model HoBo *explicitly borrowed* from wasmCloud — and [ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031) names **Wasmtime** (local default), **wasm-in-container** (v1 prod default), and **SpinKube / wasmCloud-lattice / provider-native** as the `component-host` adapters. This capture documents those real systems so the decision is grounded, not hand-waved, and stress-tests whether the adapter set holds up.

## The three hosts at a glance
| Host | Shape | Where it runs | Cross-host links | HoBo role ([ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031)) |
|---|---|---|---|---|
| **Wasmtime** | the canonical Bytecode Alliance Component-Model engine (a library/CLI) | embed anywhere (local, in-container, edge) | — (single host) | **local/dev default** + the engine *inside* the wasm-in-container default |
| **Spin / SpinKube** | HTTP-trigger wasm apps; **SpinKube** runs them on K8s via a **containerd shim (runwasi)** | Kubernetes (SpinKube), CLI, Fermyon Cloud | via K8s networking | **k8s-native `component-host` adapter** |
| **wasmCloud** | capability-provider + **lattice** mesh; WIT links over **wRPC/NATS** | any cloud / K8s / edge / browser, as one flat mesh | ✅ **native** (links span hosts on the lattice) | **lattice adapter** (cross-host link migration, [ADR-0040](../../docs/design/adr/05-config-matching-environments.md#adr-0040)) |

## Key shared facts (validation for HoBo)
- **WASI components are portable across hosts.** "WASI-http components have many compatible hosts — Spin (CLI), Fermyon Cloud, **Wasmtime**, NGINX Unit, SpinKube …" — direct evidence for HoBo's **one component, many `component-host` adapters** thesis.
- **Capability-based security by default.** All three rely on wasm's deny-by-default sandbox — HoBo's `.allow()`→link enforcement ([Plan 21](../../docs/design/21-resources-catalog.md)/[Plan 20](../../docs/design/20-wasm-wasi-runtime.md)) is the same property.
- **Perf:** "a typical Wasm module starts in **~1 ms** (cold start), consumes **~10 MB**, binary **< 5 MB**, vs a container's ~300 ms / 50–100 MB" — grounds HoBo's "ms cold start, tiny footprint, scale-to-zero" cost/density claims ([Plan 16](../../docs/design/16-cost-finops.md)/[Plan 20](../../docs/design/20-wasm-wasi-runtime.md)).
- **WIT as the contract** across all three — the same standards-based contract HoBo uses for ports ([Plan 24](../../docs/design/24-wit-interfaces-reference.md)).

## Files
- [`wasmcloud.md`](./wasmcloud.md) — lattice, capability providers, WIT links over wRPC.
- [`spin-spinkube.md`](./spin-spinkube.md) — Spin + SpinKube (containerd shim, operator), portability, perf.
- [`hobo-mapping.md`](./hobo-mapping.md) — landscape ↔ HoBo `component-host` + links; ADR-0031 stress-test.
