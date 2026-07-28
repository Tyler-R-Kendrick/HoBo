---
layout: ../../layouts/Docs.astro
title: Component hosts
description: "Camp componentHost backends: runtime-local/browser EventStore engines vs wasm, oci, and cloud-native hosts."
---

# Component hosts

Camps separate two concerns that both live under `packages/runtimes/`:

| Concern | Packages | Role |
|---|---|---|
| **Durable EventStore engines** | `@hobo/runtime-local`, `@hobo/runtime-browser` (+ `@hobo/storage-sqlite`) | Single-owner journal, fencing, staged effects (ADR-0135) |
| **Component hosts** | `@hobo/runtime-wasm`, `@hobo/runtime-oci`, `@hobo/runtime-cloud-native` | How bindle components actually run |
| **Optional sidecar runtime** | `@hobo/runtime-dapr` | Dapr-backed ActorHost + pubsub when Camp opts in (ADR-0138; **not** default — ADR-0031) |

App authors pick ports and Bindles; operators/hosts choose engines. Conformance certifies claims.

## EventStore engines (shipped default path)

| Package | Host | Notes |
|---|---|---|
| `@hobo/runtime-local` | Node | `node:sqlite` + storage worker |
| `@hobo/runtime-browser` | Browser | SQLite WASM + OPFS; fail-closed if durable required without OPFS |

See [EventStore](/HoBo/reference/eventstore/) · [Runtime ports](/HoBo/reference/runtime-ports/).

## Component host kinds

### `componentHost=wasm` — `@hobo/runtime-wasm`

- Private components componentized to **wasi:http** and run in **Wasmtime OS-process sandboxes**
- Public web may stay process-local (wired by the app host)
- Structural capability deny-by-default (only linked WIT imports are invokable)

### `componentHost=oci` — `@hobo/runtime-oci`

1. Accept prebuilt wasi:http `.wasm` (composition often via `runtime-wasm`)
2. Pack local **OCI** layout under `$HOBO_HOME/oci`
3. Schedule on **Kubernetes** through a PACT-shaped **`KubectlTransport`** (`version`, `cluster-info`, `namespace/ensure`, `apply`, `rollout-status`)

No ambient kubeconfig privileges outside the transport port.

### `componentHost=cloud-native` — `@hobo/runtime-cloud-native`

- Registry of multi-cloud host providers
- **`mock`** provider for setup/parity tests
- `aws` / `gcp` / `azure` / `vercel` / `cloudflare` entries are **stubs** until certified adapters land

### Optional `kind=dapr` — `@hobo/runtime-dapr`

- Camp `runtimeRequirements: ["dapr"]` (or explicit placement) selects Dapr
- Realizes **ActorHost** (single-writer mapped to Dapr concurrency) and **Messaging** over pub/sub (including generated `pubsub.kafka` YAML)
- Inject `createInMemoryDaprClient()` for live harness fidelity; real `daprd` implements the same client interface
- Default path remains in-process wasm — see [Messaging, Kafka & Dapr](/HoBo/reference/messaging/)

```ts
import { createCloudNativeRuntimeHost } from "@hobo/runtime-cloud-native";

const host = createCloudNativeRuntimeHost({ defaultProvider: "mock" });
await host.ensure({ hoboHome });
```

## Design / later engines

`runtime-postgres`, `runtime-temporal`, `runtime-restate`, `runtime-cloudflare` (Durable Objects) remain design-stage EventStore/workflow backends — not substitutes for the component-host table above.

## Related

[Package map](/HoBo/reference/packages/) · [WASM guide](/HoBo/architecture/wasm/) · [Trail map](/HoBo/guide/status/) · [Conformance](/HoBo/testing/conformance/)
