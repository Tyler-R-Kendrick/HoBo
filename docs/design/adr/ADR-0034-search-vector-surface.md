# ADR-0034 — Search & vector surface

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 35 — Search & vector surface](../35-search-vector-surface.md) · [Plan 21 — Resource catalog](../21-resources-catalog.md) (`search`/`embed` rows) · [Plan 24 — WIT worlds](../24-wit-worlds-reference.md) (`hobo:search`/`hobo:embed`) · [Plan 32 — Reactive queries](../32-reactive-live-queries.md) ([ADR-0029](./ADR-0029-reactive-live-query-model.md)) · [Plan 34 — App-data migrations](../34-app-data-migrations.md) ([ADR-0032](./ADR-0032-data-portability-schema-versioning.md)) · [ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md) (Matching) · [Plan 6](../06-ai-native-agent-auth.md)/[Plan 31](../31-config-secretless-secrets.md) (secretless `embed`) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (G2/Q22) · [Convex capture](../../../competitors/convex/scheduling-search-storage.md)
- **Origin:** the gap analysis (G2/Q22) found HoBo *named* `vector()`/`search()` but never specified them, while Convex ships full-text + vector search first-class. Designed via brainstorming + grill-with-docs.

## Context
`vector()` and `search()` appear only as SaaS primitives in [Plan 2](../02-sdk-api.md) §53, and `vector` is a `database` *feature* in the capability model ([Plan 3](../03-providers-iac.md)) — but there is **no port, no WIT world, no index/operator/filter model, and no equivalence class**. Meanwhile [Plan 32](../32-reactive-live-queries.md) explicitly deferred "reactive search" pending this. A Convex-style TS-backend audience expects search as a built-in, so the surface must be specified to be credible.

## Decision
1. **A first-class unified `search` port** (`hobo:search`) covering **full-text + vector + hybrid (RRF)** in one interface — not three separate ports and not bolted onto the `database` port. It is realized by a provider **equivalence class** (pgvector + Postgres-FTS ↔ OpenSearch / Azure AI Search / Pinecone / Turbopuffer), selected per context by **Matching** ([ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md)). `.allow()` verbs: `index`/`query`/`admin`.
2. **Declarative index declaration** (text index: fields + analyzer + prefix; vector index: field + `dimensions` + filter fields). An index *is* schema, so it flows through the gated **expand/backfill/contract** migration machinery ([Plan 34](../34-app-data-migrations.md)).
3. **Reactivity split by determinism:** full-text + filtered search are deterministic → **reactive `query()`/`useQuery()`** citizens ([Plan 32](../32-reactive-live-queries.md), re-push on `data.Changed`); **vector search is a `step`** (external embedding = non-deterministic, off the reactive path); **hybrid is a `step`** fusing a reactive text query + a vector step via reciprocal rank fusion. Filters use the same typed `eq`/`in`/`range` predicate DSL used elsewhere.
4. **An `embed` capability** (`hobo:embed`) behind the port auto-embeds rows + text queries, brokered secretlessly ([Plan 6](../06-ai-native-agent-auth.md)/[Plan 31](../31-config-secretless-secrets.md)) and realized **per Camp** (local/in-boundary model for dev/air-gap; hosted API for prod), Matching-selected. **BYO precomputed vectors** is the escape hatch. The pgvector + local-model path is a complete, no-egress default — portability is never gated behind a paid embedder.
5. **No new event types** — reuse `query.*` + `data.Changed`, `migration.*`, and `run.StepCompleted`.

## Alternatives considered
- **Search-as-a-DB-capability (index on the `database`/`sql` resource, Convex's model).** Rejected as the structure: couples search to the DB provider's FTS/vector support, weakens cross-cloud portability, and makes a dedicated managed search engine awkward. (HoBo still *realizes* the port with pgvector when colocation is best — but the port is first-class.)
- **Two separate ports (`vector` + `search`).** Rejected: duplicates index/filter/declaration machinery and turns hybrid search into a cross-port dance.
- **All search reactive (incl. vector).** Rejected: the embedding call is external/non-deterministic; reactivity would re-run network calls and break the consistent-snapshot guarantee ([ADR-0029](./ADR-0029-reactive-live-query-model.md)).
- **All search non-reactive (step only).** Rejected: drops the live full-text DX Plan 32 teed up and that Convex ships.
- **BYO-embedding only.** Rejected as the default (kept as the escape hatch): less batteries-included and off-message for an AI-native platform; the `embed` capability makes vector search "just work."

## Consequences
- **(+)** Closes the one mainstream data gap (G2/Q22) with a portable, reactive-where-it-can-be surface; unblocks Plan 32's deferred reactive search.
- **(+)** Reuses ports/adapters + Matching (ADR-0033), the migration machinery (Plan 34), the reactive reactor (Plan 32), and secretless auth (Plan 31) — minimal new machinery, no new event types.
- **(+)** The local-model `embed` adapter gives an air-gap-friendly, no-egress default (relates to G6/Q20).
- **(−)** A unified port spanning pgvector → managed engines means a broad conformance surface (FTS analyzers + vector ops vary by backend); equivalence-class fidelity is the ongoing work.
- **(−)** An embedding-model change is itself an index migration (re-embed) — correct but operationally heavy; flagged as an iteration hook.
