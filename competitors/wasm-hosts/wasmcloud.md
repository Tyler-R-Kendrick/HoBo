# wasmCloud — lattice, capability providers, WIT links

> Part of the [wasm-hosts reference](./README.md). The system HoBo's **links** model was borrowed from ([Plan 20](../../docs/design/20-wasm-wasi-runtime.md)). Source: [wasmcloud.com/docs/concepts](https://wasmcloud.com/docs/concepts/) · [linking-components](https://wasmcloud.com/docs/concepts/linking-components/) — summarized for analysis.

## What it is
**wasmCloud** is a **CNCF** project for building/managing/scaling **polyglot wasm apps across any cloud, K8s, or edge** as one flat mesh. Components and **capability providers** communicate over a **lattice** using **WIT** contracts.

## Core concepts
- **Component** — a wasm Component-Model unit (your business logic), deny-by-default, links to capabilities it's granted.
- **Capability provider** — delivers a concrete capability (keyvalue, messaging, http, …) for a backend, **as a standard WIT interface**. Providers are "external" — standalone entities **on the lattice**, scaled/updated **independently** of any host.
- **Lattice** — a "self-forming, self-healing mesh network … a unified, flat topology across any number of environments, clouds, browsers, or even hardware," letting components/providers/hosts communicate **across infrastructure barriers**.
- **Links** — "the wasmCloud host mediates **runtime links** over the NATS lattice using the **WIT over RPC (wRPC)** protocol." Links are declared in a **manifest**; "you don't have to worry about whether your components are distributed or running on the same host — declare links … and wasmCloud coordinates them regardless of where the parts run." Links can be **same-host or cross-host**.

## Direct correspondence to HoBo
This is, almost verbatim, HoBo's [Plan 20](../../docs/design/20-wasm-wasi-runtime.md) model:
- **wasmCloud capability provider ≈ HoBo capability provider** (a Provider implementing a WIT world's exports for a backend).
- **wasmCloud link ≈ HoBo link** (late-bound import→export binding; swap the backend with no recompile). HoBo's Plan 20 literally cites "the wasmCloud model" for links.
- **wasmCloud lattice ≈ the cross-host substrate** behind HoBo's **wasmCloud-lattice `component-host` adapter** ([ADR-0031](../../docs/design/adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md)), and the lattice's **cross-host link coordination** is exactly the "migrate late-bound links across hosts without redeploy" capability HoBo attributes to that adapter for failover ([Plan 5](../../docs/design/05-reliability-ha.md)) and cross-Camp work ([ADR-0040](../../docs/design/adr/ADR-0040-cross-camp-stateful-consistency.md)).

## Refinement surfaced for HoBo (analysis)
- **wRPC (WIT-over-RPC) is the concrete cross-host link transport.** HoBo's wasmCloud-lattice adapter should adopt **wRPC over the lattice** as its cross-host link mechanism (rather than inventing one) — a small sharpening of [ADR-0031](../../docs/design/adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md)'s lattice adapter + [ADR-0040](../../docs/design/adr/ADR-0040-cross-camp-stateful-consistency.md)'s cross-host link migration. **NATS** is the lattice's transport — an operational dependency the adapter inherits (noted, not a blocker).
- **Providers scale independently of hosts** — validates HoBo treating a provider's runtime impl as separately deployable from the component.

**Net:** wasmCloud is the strongest validation that HoBo's links/capability-provider design is real and proven (CNCF, production), and it pins the concrete transport (wRPC/NATS) for HoBo's lattice adapter.
