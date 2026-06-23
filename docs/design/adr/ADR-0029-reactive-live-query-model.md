# ADR-0029 — Reactive / live-query model (event-log reactor)

- **Status:** Accepted (reframed by [ADR-0065](./ADR-0065-streaming-first-rx-materializations.md) — the reactor engine is unchanged; the *default surface* is now subscriptions/streams (RX materializations), with queries as snapshots/escape hatches)
- **Date:** 2026-06-21
- **Deciders:** Engineering, Product
- **Related:** [Plan 32 — Reactive/live queries](../32-reactive-live-queries.md) · [02 SDK](../02-sdk-api.md) · [11 Event model](../11-event-model.md) · [21 Resources](../21-resources-catalog.md) · [24 WIT interfaces](../24-wit-interfaces-reference.md) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (G1) · open question [#21](../09-verification-open-questions.md)
- **Origin:** the competitor gap analysis flagged a **reactive/live-query data model** (Convex's core DX) as HoBo's one true blind spot. Designed via brainstorming + grill-with-docs.

## Context
Convex's headline DX — `useQuery()` that auto-recomputes and pushes to every client on write, with consistent snapshots — works because queries are **deterministic functions over one built-in database**, tracked by a reactor that records each query's read-set. HoBo cannot copy this directly: it is **event-sourced** (the log is already a change stream and projections already exist) and **multi-cloud** (app data lives in *provider* databases that vary — there is no single DB to reactor over). HoBo needs reactivity that fits its log-first, portable, multi-cloud model without forcing a single database.

## Decision
Build a **reactor on the event log**, with three locked choices:
1. **Hybrid source.** Reactive queries run over the **event log / projections** by default (native, portable, zero extra infra, works on any Camp runtime). Provider databases join via an **opt-in `change-feed` capability** on the `database` port, normalized into `data.Changed` events so the *same* reactor handles DB-backed queries. v1 ships the capability interface + one reference adapter (Postgres); sources without a change feed are typed non-reactive.
2. **Per-query consistent snapshot @ `seq` + reads-your-writes.** Each pushed result is computed at a single monotonic log position; pushes are delivered in `seq` order (clients never regress); a mutation returns its `seq` and the client's subscriptions advance to ≥ it before the write acks. *Not* global serializability (too costly across multiple streams + providers).
3. **A deterministic, read-only `query()` primitive + `"use query"` directive** (sibling to `step`/`workflow`/`"use training"`), with the runtime auto-tracking the read-set per execution, surfaced to clients as a typed `useQuery()` hook (+ `subscribe`/`runQuery`). Optimistic updates supported.

## Alternatives considered
- **Provider-DB change feeds only (most Convex-like).** Rejected as the *default*: it's provider-specific, needs CDC for every backend, and isn't portable; kept as the opt-in capability.
- **Just realtime event push (pub/sub), no query reactivity.** Rejected: doesn't close the DX gap (no derived/consistent query results), though it's a strict subset the reactor subsumes.
- **Global serializable snapshots (single-reactor semantics).** Rejected for v1: expensive/hard across multiple streams + multi-provider; per-query consistent snapshots give Convex's feel at far lower cost.
- **Subscribe-to-named-projections only (no new primitive).** Rejected: only pre-declared views would be reactive — less flexible and less Convex-like than an app-defined `query()`.

## Consequences
- **(+)** Closes the one mainstream-DX gap vs Convex while staying log-first, portable across Camps/runtimes, and multi-cloud-safe; reuses the event log + `Streamer` + projections HoBo already has.
- **(+)** Reactivity inherits HoBo's superpowers — replay, audit, determinism — and the `change-feed` capability rides the existing conformance trust boundary.
- **(−)** A new always-on data-plane component (the `Reactor`, renamed from `QueryReactor` by [ADR-0065](./ADR-0065-streaming-first-rx-materializations.md)) with fan-out, coalescing, and backpressure to engineer ([Plan 5](../05-reliability-ha.md)); a hot stream can wake many subscriptions (mitigated by the inverted stream→subscription index + sharding).
- **(−)** DB-backed reactivity is only as good as each provider's change feed; coverage beyond the Postgres reference adapter is incremental, and cross-Camp reactive queries are deferred (open [Q16](../09-verification-open-questions.md)).
- **Resolves** open question #21; **enabled** reactive search (#22), now specified in [Plan 35](../35-search-vector-surface.md)/[ADR-0034](./ADR-0034-search-vector-surface.md) (full-text/filtered search re-pushes on `data.Changed`; vector search is a step).
