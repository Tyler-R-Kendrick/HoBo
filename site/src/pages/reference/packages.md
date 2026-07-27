---
layout: ../../layouts/Docs.astro
title: Package map
description: "Canonical @hobo/* ownership: authoring, contracts, runtime, storage, adapters, and surfaces."
---

# Package map

Dependencies point **inward only** (`apps → adapters → runtime/sdk → core`).

## Layers

| Layer | Packages | Notes |
|---|---|---|
| **Authoring** | `@hobo/bindles`, `@hobo/camps`, `@hobo/yards`, `@hobo/junctions` | App + topology factories |
| **Contracts** | `@hobo/core`, `@hobo/wit`, `@hobo/contracts`, `@hobo/policy`, `@hobo/contract-harness`, `@hobo/conformance` | Ports, IR, Gatekeeper, PACT harness |
| **Runtime** | `@hobo/runtime`, `@hobo/data`, `@hobo/events`, `@hobo/storage-sqlite`, `runtimes/*` | Workflows, CQRS, journal, Camp engines |
| **Adapters** | `providers/*`, `iac/*`, `build/*` | Clouds, IaC, component builds |
| **Surfaces** | `@hobo/cli`, `@hobo/mcp`, `@hobo/sdk`, `@hobo/broker`, `@hobo/identity`, … | Humans, agents, operators |

## Storage / runtime engines

| Package | Role | Status |
|---|---|---|
| `@hobo/storage-sqlite` | Schema, migrations, `SqliteJournal` semantics | Shipped |
| `@hobo/runtime-local` | Node EventStore + storage worker | Shipped |
| `@hobo/runtime-browser` | Browser SQLite WASM + OPFS policy | Shipped (OPFS open env-dependent) |
| `runtime-postgres` / `temporal` / `restate` / `cloudflare` | Alternate engines | Design / later |

## Contracts plane

| Package | Role |
|---|---|
| `@hobo/contracts` | BoundaryContract, can-deploy, Gatekeeper, EffectSpec, ResilienceProfile |
| `@hobo/contract-harness` | PACT + effect isolation + fault injection |
| `@hobo/policy` | Policy packs composed by Gatekeeper |

## Ownership rules

- App authors import `@hobo/bindles` / `@hobo/runtime` / `@hobo/data` / `@hobo/events` — not storage engines.
- `@hobo/core` is substrate (ports, envelopes) — not app authoring factories.
- SQLite is the **default engine**, not the public portability boundary.

See also [Architecture](/HoBo/guide/architecture/).
