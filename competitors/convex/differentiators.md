# Convex — Differentiators & Gaps

> Part of the [Convex reference](./README.md). Strengths, gaps, and head-to-head comparisons.

## Differentiators (what's genuinely strong)
1. **Reactive by default** — the deterministic query reactor: queries auto-subscribe and re-run on dependency change; all clients get the **same consistent snapshot** simultaneously. No cache-invalidation or WebSocket plumbing.
2. **End-to-end TypeScript + codegen** — DB schema, functions, validators, and **typed function references** (`convex/_generated/`) make calls compile-checked from client to DB; renames/validator changes break at call sites.
3. **Serializable OCC transactions** — mutations are atomic; no locks; auto-retry on conflict.
4. **Batteries included** — scheduled functions + cron, file storage, full-text + **vector search**, HTTP actions, auth — in one backend.
5. **Components** — sandboxed, transactional, reusable backend modules (rate limiters, workflows, agents…).
6. **AI-friendly** — typed, SQL-less, low-boilerplate code that LLMs generate reliably; MCP server + agent skills.
7. **Programmable platform** — Management API + OAuth apps + deploy keys ([management-platform-api.md](./management-platform-api.md)) let third parties provision/operate Convex for users.
8. **OSS self-host** — full backend (Rust) under FSL→Apache-2.0; no hard lock-in.

## Gaps (relative to HoBo's scope)
1. **TS/JS-centric** runtime; **document model only** (no SQL/relational/multi-model; joins/aggregations are hand-written JS).
2. **Single-vendor backend** — Convex Cloud or self-host; **not multi-cloud, not IaC, not a control plane** for *other* infra.
3. **Hard per-call ceilings** (1s queries/mutations, 10-min actions, 1 MiB docs) shape (and constrain) architecture.
4. **No event-sourced replay/time-travel** of the whole system; reactivity ≠ an append-only audit log.
5. Management/Platform API is **Beta**; some surfaces documented only via OpenAPI.

## Head-to-head
| vs | Convex's edge | Their edge |
|---|---|---|
| **Firebase** | type-safe TS functions + real serializable transactions + reactive queries | bigger ecosystem, GCP integration, more mature mobile |
| **Supabase** | reactive-by-default + end-to-end TS + components | Postgres/SQL, relational power, broad SQL tooling |
| **Appwrite** | reactive queries + codegen + OCC transactions | self-host maturity, broader language SDKs |
| **PlanetScale / Neon** | full backend (functions/sync/auth), not just a DB | serverless SQL at scale, branching |
| **Aspire** ([../aspire](../aspire/README.md)) | a *running managed backend* + reactivity | Aspire orchestrates *your* polyglot services to *your* infra (composition, not a hosted DB) |

## Net for HoBo
Convex is a **managed reactive backend**; HoBo is a **multi-cloud control plane / IfC platform**. They're adjacent: Convex's codegen + typed function references corroborate HoBo's WIT-generated-clients approach, its Management/OAuth API corroborates HoBo's control-plane/provisioning API, and Convex itself is the *kind of backend HoBo could target as a capability provider*. HoBo's deltas: multi-cloud + IaC + Resource Definitions/matching, event-sourced replay/audit, agents-as-principals + Forge generation, and a governed hosted plane. See [hobo-mapping.md](./hobo-mapping.md).
