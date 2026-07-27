---
layout: ../../layouts/Docs.astro
title: WIT & storage
description: "Component Model storage capability: hobo:storage is engine-neutral; SQLite handles never cross the guest boundary."
---

# WIT & storage

## Principle

WebAssembly Components **import** storage capabilities from the host. Guests must not assume filesystem paths, SQL dialects, or SQLite handles.

## `hobo:storage@0.1.0` (intent)

Host-facing surface (conceptual):

- Append / commit with `expected-seq` and optional `fence-token` (`u64`)
- Bounded stream pages and positioned catch-up pages (cursors, not unbounded lists)
- Typed errors: optimistic conflict, stale fence, busy, unsupported schema, …
- Subscription claim / checkpoint with fencing

No SQL, VFS names, or file paths appear on the WIT boundary.

## Hosts

| Host | Engine |
|---|---|
| Node runtime-local | `node:sqlite` + worker, serial owner |
| Browser | SQLite WASM + OPFS when available |
| Future | Postgres / managed stores behind same ports |

## Authz

Host binds tenant/lane/capability grants. A guest cannot choose a broader tenant or baseline lane than its grant.

## Related

[EventStore reference](/HoBo/reference/eventstore/) · [Architecture](/HoBo/guide/architecture/)
