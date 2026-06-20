# Convex — Competitor Reference

> Captured for HoBo competitive analysis (research as of 2026, from docs.convex.dev / convex.dev / get-convex GitHub). An exhaustive capture — Convex's deployment, generated-code, and management surfaces get dedicated files. HoBo↔Convex parity in [`hobo-mapping.md`](./hobo-mapping.md).
>
> Files: [database.md](./database.md) · [functions.md](./functions.md) · [scheduling-search-storage.md](./scheduling-search-storage.md) · [reactivity-clients-components.md](./reactivity-clients-components.md) · [cli-deployment.md](./cli-deployment.md) · [generated-code.md](./generated-code.md) · [management-platform-api.md](./management-platform-api.md) · [integrations-ops.md](./integrations-ops.md) · [self-hosting-pricing.md](./self-hosting-pricing.md) · [differentiators.md](./differentiators.md) · [hobo-mapping.md](./hobo-mapping.md)

## What it is
**Convex** is a **reactive, TypeScript-first backend platform** — *"the backend building blocks for your apps and agents."* You express the whole backend in pure TypeScript — **database**, schema, server **functions**, auth, scheduling, search — and Convex keeps frontend ↔ backend ↔ database **in sync in real time**. The three pillars:
- **Database** — an ACID document database (with vector search + file storage).
- **Functions** — server-side TypeScript: reactive **queries**, transactional **mutations**, side-effecting **actions**, HTTP actions, crons.
- **Sync** — automatic real-time subscriptions; clients always see a consistent snapshot.

### The deterministic query reactor (the core idea)
Queries must be **deterministic** (same inputs → same outputs). The database tracks each query's read dependencies; when any of that data changes, the query **re-runs** and all subscribed clients are pushed the new result **simultaneously**. No manual cache invalidation, no hand-rolled WebSockets.

## At a glance
| Dimension | Convex |
|---|---|
| Category | Reactive backend-as-a-service (DB + functions + sync) |
| Language | **TypeScript** end-to-end (codegen'd types) |
| Database | Document model, **schemas + indexes**, **OCC serializable** transactions |
| Functions | queries (reactive) · mutations (txn) · actions (external; Convex/Node runtime) · HTTP actions |
| Realtime | automatic subscriptions; consistent snapshots; optimistic updates |
| Extras | scheduled fns + cron, file storage, **full-text + vector search**, components |
| Deploy | `npx convex deploy`, deploy keys, dev/prod/preview, CI/Vercel/Netlify ([cli-deployment](./cli-deployment.md)) |
| Codegen | `convex/_generated/` `api`/`server`/`dataModel` ([generated-code](./generated-code.md)) |
| Programmatic | **Management API** `api.convex.dev/v1` + OAuth apps + HTTP API ([management-platform-api](./management-platform-api.md)) |
| Hosting | Convex Cloud (Free/Pro/Enterprise) **or self-host** (Rust, FSL license) |
| Clients | React, Next.js, Vue, Svelte, Python, Rust, iOS, Android, Node |

## Known gaps (vs HoBo's scope)
- **TS/JS-centric** runtime; document-model only (no relational SQL, no multi-model).
- **Single-vendor backend** (or self-host) — not a multi-cloud / IaC / control-plane story.
- Hard per-call limits (1s queries/mutations, 10-min actions, 1 MiB docs) — see [self-hosting-pricing.md](./self-hosting-pricing.md).
- The **Management/Platform API is Beta**; some endpoints undocumented outside the OpenAPI spec.

Convex is **adjacent** to HoBo, not a head-on competitor: it's the kind of backend HoBo could *target as a capability provider*, and a sharp reference point for HoBo's generated-clients + control-plane/provisioning APIs. See [hobo-mapping.md](./hobo-mapping.md).
