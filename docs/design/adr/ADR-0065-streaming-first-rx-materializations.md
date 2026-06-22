# ADR-0065 — Streaming-first: RX subscribable materializations as the default read surface

- **Status:** Accepted (reframes [ADR-0029](./ADR-0029-reactive-live-query-model.md) and [ADR-0050](./ADR-0050-event-sourced-domain-data-projection-sinks.md) — the engine is unchanged; the *default surface* becomes subscriptions/streams, not queries)
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 32 — Reactive streams & subscriptions](../32-reactive-live-queries.md) · [Plan 39 — Data plane](../39-data-plane-projections.md) · [Plan 11 — Event model](../11-event-model.md) · [Plan 2 — SDK](../02-sdk-api.md) · [Plan 35 — Search](../35-search-vector-surface.md) · [ADR-0029](./ADR-0029-reactive-live-query-model.md)/[ADR-0050](./ADR-0050-event-sourced-domain-data-projection-sinks.md)/[ADR-0052](./ADR-0052-projection-sink-paradigm-taxonomy.md)/[ADR-0053](./ADR-0053-write-side-aggregates-and-commands.md)

## Context
HoBo's SDK is **event-based with actor models**: the append-only log is the source of truth, actors fold streams into state, and projections fold streams into read models ([ADR-0003](../18-adr-log.md)/[ADR-0050](./ADR-0050-event-sourced-domain-data-projection-sinks.md)). The read surface, however, was framed **query-first** — `view()/repo()` "query a projection by logical name," with reactivity bolted on via `"use query"` ([ADR-0029](./ADR-0029-reactive-live-query-model.md)). That mirrors how Convex/Lakebed work: *query a database; the platform re-runs the query on change.*

For an event-sourced + actor runtime that is the wrong default. Data is **materialized from streams**, not stored-then-queried; a registration for event types already *is* a subscription; and real-time push is the natural mode, not an opt-in. The default read surface should be **subscribe to a stream**, RX-style (reactive-extensions: observable pipelines you compose and subscribe to), with query-a-store as the escape hatch.

## Decision
**Subscriptions/streams are the default; queries are an escape hatch.** Concretely:

1. **The default read primitive is a subscription to an observable materialization.** `subscribe(materialization | eventTypes) → Observable<T>` replays history up to the current `seq`, then pushes live updates — classic RX "current value + updates" (a `ReplaySubject`/`scan` over the log). The client default is **`useSubscription()`** (an observable that re-renders on push).
2. **A materialization is an RX pipeline over event-type subscriptions.** It is the same artifact as a **projection** ([Plan 39](../39-data-plane-projections.md)) — a deterministic fold over subscribed event types — but its *surface* is a subscribable observable, composed with RX operators (`map`/`filter`/`scan`(fold)/`distinctUntilChanged`/`combineLatest`/`window`/…), not a table you `SELECT` from. **Registration = subscription:** declaring a materialization/handler over event types creates the subscription (its read-set).
3. **Streaming by default.** Every materialization is reactive by construction over the native log; the question is no longer "is this query reactive?" but "where is this materialization *cached*?"
4. **The store demotes to an optional cache.** A **projection sink** ([ADR-0050](./ADR-0050-event-sourced-domain-data-projection-sinks.md)) is no longer "the database you query" — it is an **optional durable, queryable cache** of a materialization, added when you need point-lookups, secondary indexes, search, analytics, or large fan-in. The native log-backed materialization is the default; a sink is opt-in.
5. **Query / point-read / search / analytics are explicit escape hatches** served from the sink cache: `snapshot(m)`/`runQuery` (one-shot current value), `repo.get(id)` (point lookup), `view(...).search(...)` ([Plan 35](../35-search-vector-surface.md)), `.raw(driver => …)` (non-portable), and OLAP/batch reads. They are first-class but **not the default** — you reach for them when a stream subscription is the wrong shape (ad-hoc/point/analytical), and `hobo doctor` nudges toward subscriptions for live views.
6. **The engine is unchanged.** The reactor, consistent-snapshot-@-`seq`, reads-your-writes, the inverted read-set index, coalescing/backpressure, and the `change-feed` capability ([ADR-0029](./ADR-0029-reactive-live-query-model.md)) all stand — they are now described as the *implementation of RX subscribable materializations*. Determinism rules for folds/operators are the existing `query()`/`workflow` rules. `useQuery()` is retained as **sugar** for `useSubscription()` over a materialization (Convex familiarity), not the primary.

## Alternatives considered
- **Keep query-first (status quo, ADR-0029).** Rejected: it frames an event-sourced runtime like a DB-query platform, hiding the stream-native model and matching Convex/Lakebed instead of differentiating from them.
- **Purist: everything is a stream, no query API at all** (point reads = `subscribe().first()`). Rejected for v1: point-lookup, full-text/vector **search**, pagination, and OLAP/analytics are awkward or impossible as pure streams; keeping them as escape hatches over the sink cache is pragmatic and honest. (Streaming is the *default*, not the *only* surface.)
- **A separate streaming API alongside the query API.** Rejected: two parallel read surfaces invite divergence; instead one model (subscribable materializations) with query as a derived snapshot.

## Consequences
- **(+)** The read model matches the SDK's event/actor foundation: materialize-from-streams, subscribe-by-default, real-time push without opt-in.
- **(+)** Sharper differentiation vs Convex/Lakebed: *they query a database; HoBo gives you subscribable RX materializations over the event log*, portable across Camps.
- **(+)** No new engine — a surface/framing reorientation over the existing reactor + projections; the consistency guarantees are preserved verbatim.
- **(−)** RX is a different mental model than `useQuery`; mitigated by keeping `useQuery`/`repo`/`view` as familiar sugar/escape hatches and good docs.
- **(−)** Non-stream-shaped reads (search/OLAP/point) are escape hatches over a cache, so they carry the sink's reactivity/consistency caveats ([Plan 39](../39-data-plane-projections.md) honest-limits) — stated, not hidden.
- **(↔)** ADR-0029/0050 are reframed (not superseded); Plan 32 is retitled "Reactive streams & subscriptions"; Plan 39 reframes sinks as caches; the SDK surface ([Plan 2](../02-sdk-api.md)/[Plan 24](../24-wit-interfaces-reference.md)) leads with `subscribe`/`useSubscription`.
