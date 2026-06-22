# ADR-0052 — Projection-sink paradigm taxonomy & the reactivity boundary

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 39 — Data plane: projections](../39-data-plane-projections.md) · [ADR-0050](./ADR-0050-event-sourced-domain-data-projection-sinks.md) (projections) · [ADR-0051](./ADR-0051-wit-record-canonical-domain-schema.md) (the mapped record) · [Plan 32 — Reactive queries](../32-reactive-live-queries.md) (`change-feed`, the reactor) · [Plan 35 — Search & vector](../35-search-vector-surface.md) (vector/text sink; the determinism boundary precedent) · [Plan 25 — Matching](../25-resource-definitions-matching.md)/[ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md) (sink selection) · [Plan 3 — equivalence classes](../03-providers-iac.md) · [Plan 34 — App-data migrations](../34-app-data-migrations.md)
- **Origin:** the data plane must support many persistence paradigms (data lake, SQL, NoSQL, graph, vectorDB) honestly; we need to fix what ships v1 vs roadmap and a clear rule for when a projection is reactive. Designed via brainstorming.

## Context
A persistence-agnostic data plane ([ADR-0050](./ADR-0050-event-sourced-domain-data-projection-sinks.md)) implies many backend paradigms behind one projection abstraction. Two risks: (a) pretending every paradigm is equally first-class in v1 when only a few have adapters, and (b) implying every backend can serve **reactive** queries when many cannot (no change-feed; analytical/batch engines). [Plan 35](../35-search-vector-surface.md) already set the precedent that *vector search is non-reactive (a step)* while text/filter search is reactive — we generalize that honesty across all paradigms.

## Decision
1. **Model the projection sink as a paradigm-tagged kind** behind the `hobo:projection` port: a Matching dimension `type: "projection-sink", paradigm: relational|document|kv|wide-column|graph|vector|object-lake|olap|native`. Adding a paradigm is a new adapter behind the **stable port**, not a model change.
2. **v1 ships a subset; the rest is named roadmap.** **v1:** **native** (log/standing projection), **relational** (Postgres reference), **one document** (Mongo reference), and **vector** (via [Plan 35](../35-search-vector-surface.md)'s `search`). **Roadmap:** KV/wide-column, graph, object/data-lake, OLAP/columnar.
3. **The reactivity boundary, as one rule:** a projection is **reactive iff** its sink advertises the `change-feed` capability **or** it is the native log-backed projection; otherwise it is typed `reactive: false` and `hobo doctor` warns when a `"use query"` depends on it ([Plan 32](../32-reactive-live-queries.md)'s existing check). Consequently vector search, object-lake, and OLAP are **off the reactive path by construction**.
4. **Portability is equivalence-class-bounded** ([Plan 3](../03-providers-iac.md)): "same Bindle, N backends" holds *within* a paradigm class (managed-relational, document, …). Cross-*paradigm* portability is **not** guaranteed — the schema mapping is paradigm-specific. Cross-engine *within* a class follows [Plan 34](../34-app-data-migrations.md)'s export→import.
5. **Each sink kind ships a `@hobo/conformance` suite:** claim a paradigm → round-trip a fixture record set and, if reactive, emit ordered `data.Changed` ([Plan 24](../24-wit-interfaces-reference.md)/[Plan 9](../09-verification-open-questions.md)).

## Alternatives considered
- **Ship only relational v1, add paradigms ad hoc later.** Rejected: without the taxonomy + stable port now, later paradigms would bend the model; modeling all paradigms up front keeps adapters additive.
- **Claim universal reactivity (poll non-change-feed sinks transparently).** Rejected: hidden polling lies about freshness/cost; the explicit `reactive: false` + `hobo doctor` warning is honest (matches [Plan 35](../35-search-vector-surface.md)'s vector-as-step stance).
- **Promise cross-paradigm portability (auto-translate relational↔document).** Rejected: lossy/semantic, not mechanical; equivalence-class bounding keeps the portability guarantee real ([ADR-0024](./ADR-0024-portability-conformance-guarantee.md)).

## Consequences
- **(+)** A data architect can target SQL today and graph/lake/OLAP later behind the same developer surface, with the limits stated up front.
- **(+)** One memorable reactivity rule; developers know which queries live-update before they ship.
- **(+)** Conformance per paradigm keeps adapters trustworthy (the same trust boundary as every other HoBo port).
- **(−)** Several high-value paradigms (graph, OLAP, data-lake) are roadmap, not v1 — the abstraction exists but the adapters don't yet.
- **(−)** Non-reactive paradigms split the developer mental model ("this query won't live-update"); the type flag + `hobo doctor` warning are the mitigation.
- **(−)** Equivalence-class bounding means a relational→document move is a re-model, not a config flip — honest, but not the frictionless any-backend ideal.
