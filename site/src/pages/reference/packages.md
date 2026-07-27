---
layout: ../../layouts/Docs.astro
title: Package map
description: "Canonical @hobo/* ownership: authoring, contracts, runtime, storage, identity, connectivity, stations, trails, adapters, and surfaces."
---

# Package map

Dependencies point **inward only** (`apps → adapters → runtime/sdk → core`). App authors import factories and runtime helpers — not storage engines or raw WIT bindings — unless they are host implementers.

## Layers

| Layer | Packages | Notes |
|---|---|---|
| **Authoring** | `@hobo/bindles`, `@hobo/camps`, `@hobo/yards`, `@hobo/junctions` | App + topology factories |
| **App runtime** | `@hobo/runtime`, `@hobo/data`, `@hobo/events` | Workflows, CQRS, messaging |
| **Contracts** | `@hobo/core`, `@hobo/wit`, `@hobo/contracts`, `@hobo/policy`, `@hobo/contract-harness`, `@hobo/conformance` | Ports, IR, Gatekeeper, PACT |
| **Storage engines** | `@hobo/storage-sqlite`, `@hobo/runtime-local`, `@hobo/runtime-browser` | Default durable journal |
| **Identity & connectivity** | `@hobo/identity`, `@hobo/connectivity` | SVIDs, config ladder, overlay, DNS, secretless connectors |
| **Control topology** | `@hobo/stations`, `@hobo/trails`, `@hobo/broker` | Station isolation, migration recipes, Conductor |
| **Surfaces** | `@hobo/cli`, `@hobo/mcp`, `@hobo/sdk`, `@hobo/hobo` | Humans, agents, operators |
| **Adapters** | `providers/*`, `iac/*`, `cloud/*`, connector plugins | Clouds and protocols |

## Storage / runtime engines

| Package | Role | Status |
|---|---|---|
| `@hobo/storage-sqlite` | Schema, migrations, `SqliteJournal` semantics | Shipped |
| `@hobo/runtime-local` | Node EventStore + storage worker | Shipped |
| `@hobo/runtime-browser` | Browser SQLite WASM + OPFS policy | Shipped (OPFS env-dependent) |
| `runtime-postgres` / Temporal / Restate / Cloudflare | Alternate engines | Design / later |

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

## Ownership rules

1. App authors do **not** import `@hobo/storage-sqlite` for business logic.
2. `@hobo/core` is substrate — not app authoring factories.
3. `@hobo/bindles` must **not** re-export topology factories (`camp`, `yard`, `junction`).
4. SQLite is the **default engine**, not the public portability boundary.
5. Generated `_generated/**` is owned by codegen — no hand edits.

## Related

[Architecture](/HoBo/guide/architecture/) · [Runtime ports](/HoBo/reference/runtime-ports/) · [CLI](/HoBo/reference/cli/)
