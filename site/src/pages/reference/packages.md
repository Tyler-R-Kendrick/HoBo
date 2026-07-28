---
layout: ../../layouts/Docs.astro
title: Package map
description: "Canonical @hobo/* ownership: authoring, contracts, runtime, storage, identity, connectivity, stations, trails, component hosts, and surfaces."
---

# Package map

Dependencies point **inward only** (`apps → adapters → runtime/sdk → core`). App authors import factories and runtime helpers — not storage engines or raw WIT bindings — unless they are host implementers.

## Layers

| Layer | Packages | Notes |
|---|---|---|
| **Authoring** | `@hobo/bindles`, `@hobo/camps`, `@hobo/yards`, `@hobo/junctions` | App + topology factories |
| **App runtime** | `@hobo/runtime`, `@hobo/data`, `@hobo/events` | Workflows, CQRS, messaging helpers |
| **Contracts** | `@hobo/core`, `@hobo/wit`, `@hobo/contracts`, `@hobo/policy`, `@hobo/contract-harness`, `@hobo/conformance` | Ports (incl. Messaging), IR, Gatekeeper, PACT |
| **Storage engines** | `@hobo/storage-sqlite`, `@hobo/runtime-local`, `@hobo/runtime-browser` | Default durable journal (ADR-0135) |
| **Messaging backends** | `@hobo/provider-kafka`, `@hobo/runtime-dapr` | Kafka capability provider; optional Dapr Camp runtime (ADR-0138) |
| **Component hosts** | `@hobo/runtime-wasm`, `@hobo/runtime-oci`, `@hobo/runtime-cloud-native`, `@hobo/runtime-dapr` | How components execute (dapr is opt-in sidecar host) |
| **Identity & connectivity** | `@hobo/identity`, `@hobo/connectivity` | SVIDs, Harness/OpenFeature, overlay, DNS, secretless connectors |
| **Control topology** | `@hobo/stations`, `@hobo/trails`, `@hobo/broker`, `@hobo/cloud` | Station, Trails, Conductor, Planner/Matching/CD |
| **Observability** | `@hobo/replay` | Session Replay on every App Kit (DOM/session; ADR-0137) |
| **Surfaces** | `@hobo/cli`, `@hobo/mcp`, `@hobo/sdk`, `@hobo/hobo` | Humans, agents, operators |

## Storage / runtime engines

| Package | Role | Status |
|---|---|---|
| `@hobo/storage-sqlite` | Schema, migrations, journal semantics | Shipped |
| `@hobo/runtime-local` | Node EventStore + storage worker | Shipped |
| `@hobo/runtime-browser` | Browser SQLite WASM + OPFS policy | Shipped (OPFS env-dependent) |
| `@hobo/runtime-wasm` | Wasmtime component host | Shipped scaffold |
| `@hobo/runtime-oci` | OCI + kubectl transport host | Shipped scaffold |
| `@hobo/runtime-cloud-native` | Multi-cloud host registry (mock + stubs) | Shipped scaffold |
| `@hobo/runtime-dapr` | Optional Dapr sidecar Camp runtime (actors + pubsub) | Shipped scaffold (opt-in; ADR-0138) |
| `@hobo/provider-kafka` | Kafka / Redpanda / MSK capability → `wasi:messaging` | Shipped scaffold (ADR-0138) |
| `runtime-postgres` / Temporal / Restate / Cloudflare DO | Alternate engines | Design / later |

Deep dive: [Component hosts](/HoBo/reference/component-hosts/).

## Contracts plane

| Package | Role |
|---|---|
| `@hobo/contracts` | BoundaryContract, can-deploy, Gatekeeper, EffectSpec, ResilienceProfile |
| `@hobo/contract-harness` | PACT + effect isolation + fault injection |
| `@hobo/policy` | Policy packs / guardrails composed by Gatekeeper |
| `@hobo/conformance` | Port and provider conformance suites |

## Canonical import ownership (samples)

| Symbol family | Package |
|---|---|
| `bindle`, `b.api()`, `config`, `connector` | `@hobo/bindles` |
| `workflow`, `step`, `actor`, `training` | `@hobo/runtime` |
| `command`, `projection`, aggregates | `@hobo/data` |
| `emit`, `subscribe`, `saga` | `@hobo/events` |
| `camp` / `yard` / `junction` | `@hobo/camps` / `yards` / `junctions` |
| EventStore ports, naming, envelopes | `@hobo/core` |
| Trails / can-trail | `@hobo/trails` |
| Station client | `@hobo/stations` |
| Harness / OpenFeature | `@hobo/identity` |
| Overlay / secretless dial | `@hobo/connectivity` |
| Session Replay (App Kits) | `@hobo/replay` |
| App Kit taxonomy | `@hobo/bindles` (`APP_KIT_KINDS`) |
| `Messaging` / `topic()` port | `@hobo/core` (adapters: `@hobo/provider-kafka`, `@hobo/runtime-dapr`) |
| `resolveActorPlacement` | `@hobo/runtime` |

## Ownership rules

1. App authors do **not** import `@hobo/storage-sqlite` for business logic.
2. `@hobo/core` is substrate — not app authoring factories.
3. `@hobo/bindles` must **not** re-export topology factories (`camp`, `yard`, `junction`).
4. SQLite is the **default EventStore engine**, not the public portability boundary.
5. Component hosts are **not** interchangeable with EventStore engines without understanding both tables.
6. Generated `_generated/**` is owned by codegen — no hand edits.

## Related

[Architecture](/HoBo/architecture/) · [Component hosts](/HoBo/reference/component-hosts/) · [Runtime ports](/HoBo/reference/runtime-ports/) · [CLI](/HoBo/reference/cli/)
