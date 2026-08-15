---
type: Competitive Reference
title: "Rivet — competitor reference"
description: "Rivet actors as the preferred compatible ActorHost resolver — not a topology primitive and not an app authoring model."
tags: [hobo, competitors]
---

# Rivet

**Checked:** 2026-08-13  
**Sources:** [rivet.dev/docs](https://rivet.dev/docs/actors/), [Queues](https://rivet.dev/docs/actors/queues/), [GitHub rivet-dev/actors](https://github.com/rivet-dev/actors)  
**License:** Apache-2.0  
**Role in HoBo:** preferred compatible **ActorHost resolver**, not a topology primitive and not an app authoring model.

## What it is

Open-source actor runtime (RivetKit + optional self-hosted engine). Each actor can own co-located SQLite (`c.db`). Local/in-process mode needs no control plane. Runner mode connects workers outbound to a control plane.

## Impedance boundaries (do not over-claim)

| Rivet fact | HoBo consequence |
|---|---|
| Queue message is removed on **receive**, not on `complete()` | HoBo `hobo_inbox` is command authority (`kv.durable-object.durable-inbox/v1`) |
| `wait: true` between actors deadlocks on self-send | Forbidden in the adapter |
| `c.state` is mutable durable blob | Not the event-sourced journal; facts live in `hobo_events` |
| Namespace / pool | Camp/Yard resolver artifacts, not Bindle fields |
| Postgres self-host ~1k concurrent actors (docs) | Evidence class, not a HoBo guarantee |
| FoundationDB / managed cloud | Optional; unsupported until verified |
| WASM vs native SDK | Distinct from HoBo Component Model / WIT |
| Published `rivetkit` 2.3.10 `.cjs` uses `import.meta` | `require("rivetkit")` is broken; adapters use dynamic `import()` (`loadRivetkit`) |

## HoBo mapping

| HoBo | Rivet |
|---|---|
| `actor()` / Grain | Generated internal Rivet definition + compound key `["hobo", tenant, project, type, ...]` |
| EventStore (global) | Outbox → existing Camp EventStore |
| Actor-local journal | `c.db` / node:sqlite with HoBo schema |
| Trails | Logical export, not physical SQLite copy |
| Celld / Cloudflare DO | Sibling resolvers; not this package |

Marketing latency/scale numbers are **not** HoBo guarantees.
