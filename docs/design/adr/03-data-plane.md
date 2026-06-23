# Data plane, reactivity, schema & app capabilities — consolidated decisions

> Consolidated ADR decisions for **data plane, reactivity, schema & app capabilities**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0029
**Reactive engine on the event log.**

### Context
A reactive read DX — `useQuery()`-style results that auto-recompute and push to every client on write, with consistent snapshots — depends on queries being **deterministic functions over a tracked read-set**. HoBo is **event-sourced** (the log is already a change stream; projections already exist) and **multi-cloud** (app data lives in *provider* databases that vary — there is no single DB to reactor over). Reactivity must fit a log-first, portable, multi-cloud model without assuming one database.

### Decision
A **reactor on the event log**, with three locked choices:
1. **Hybrid source.** Reactive reads run over the **event log / projections** (native, portable, zero extra infra, works on any Camp runtime). Provider databases join via a **`change-feed` capability** on the `database` port, normalized into `data.Changed` events so the *same* reactor handles DB-backed reads. The capability interface ships with a Postgres reference adapter; sources without a change feed are typed non-reactive.
2. **Per-query consistent snapshot @ `seq` + reads-your-writes.** Each pushed result is computed at a single monotonic log position; pushes are delivered in `seq` order (clients never regress); a mutation returns its `seq` and the client's subscriptions advance to ≥ it before the write acks. *Not* global serializability (too costly across multiple streams + providers).
3. **A deterministic, read-only `query()` primitive + `"use query"` directive** (sibling to `step`/`workflow`/`"use training"`), with the runtime auto-tracking the read-set per execution, surfaced to clients as a typed `useQuery()` hook (+ `subscribe`/`runQuery`). Optimistic updates supported.

### Alternatives considered
- **Provider-DB change feeds only.** Rejected as the *default*: provider-specific, needs CDC for every backend, not portable; kept as the capability.
- **Realtime event push (pub/sub) with no query reactivity.** Rejected: no derived/consistent query results — a strict subset the reactor subsumes.
- **Global serializable snapshots (single-reactor semantics).** Rejected: expensive/hard across multiple streams + multi-provider; per-query consistent snapshots deliver the feel at far lower cost.
- **Subscribe-to-named-projections only (no new primitive).** Rejected: only pre-declared views would be reactive — less flexible than an app-defined `query()`.

### Consequences
- **(+)** Reactive DX while staying log-first, portable across Camps/runtimes, and multi-cloud-safe; reuses the event log + `Streamer` + projections.
- **(+)** Reactivity inherits replay, audit, and determinism; the `change-feed` capability rides the existing conformance trust boundary.
- **(−)** A new always-on data-plane component (the `Reactor`) with fan-out, coalescing, and backpressure to engineer ([Plan 5](../reliability-observability-cost.md#plan-05)); a hot stream can wake many subscriptions (mitigated by the inverted stream→subscription index + sharding).
- **(−)** DB-backed reactivity is only as good as each provider's change feed; coverage beyond the Postgres reference adapter is incremental.
- **Reactive search** is specified in [Plan 35](../data-plane.md#plan-35)/[ADR-0034](#adr-0034): deterministic search re-pushes on `data.Changed`; non-deterministic search runs as a step.

## ADR-0050
**Event-sourced app domain data; backends are projection sinks.**

### Context
The append-only event log is the single source of truth, with projections rebuilt by folding it ([Plan 11](../event-model.md#plan-11)). This must extend to application **domain data** — not just HoBo's control-plane state — without coupling the data layer to provider `sql`/`kv`/`bucket` dialects or leaving "the data layer is projections of events" true only for actor state. The question: what is the system of record for app domain data, and how literally do we take "projections of events"?

### Decision
1. **App domain data is event-sourced by default.** Domain writes are **commands → events** appended to the log ([Plan 11](../event-model.md#plan-11)); the log is the source of truth for domain data, exactly as for control-plane state.
2. **Every database is a derived projection sink.** A **projection** ([Plan 39](../data-plane.md#plan-39)) folds typed event streams into a read model and materializes it into an architect-chosen backend (SQL/NoSQL/KV/graph/vector/object-lake/OLAP) via a **schema mapping**. The developer owns the logical read-model record + queries; the **data architect owns the mapping + the backend**, selected via **Matching** ([Plan 25](../platform-engineering.md#plan-25)) and recorded in `match.Decided`. Projections are **rebuildable from zero** (replay) — the test that the log, not the sink, is authoritative.
3. **An explicit adopt-in-place escape hatch.** An existing/external DB can be declared **authoritative-external** via [ADR-0041](07-portability-extensibility.md#adr-0041) (`hobo import`, `external` kind, `echo` driver): the DB is the source of truth (not the log), writes go to it directly, and its `change-feed` (if any) feeds `data.Changed` so reactive reads still work. `hobo doctor` flags long-lived authoritative-external stores as migration debt. This enables strangler-fig adoption without forcing CQRS on day one.
4. **Read-model placement is architect-selected per context via Matching.** Default = a native standing projection over the log; opt a projection into an external sink when a purpose-built query backend is wanted. Same-store vs separate-query-DB is a `match.Decided` outcome, not a global architectural fork.
5. **Reuse, don't reinvent:** the reactor, `data.Changed`, read-set tracking, snapshot@`seq`, and reads-your-writes ([Plan 32](../data-plane.md#plan-32)); gated expand→backfill→contract for sink schema ([Plan 34](../data-plane.md#plan-34), where rebuild-from-zero *is* a backfill); single-writer-Camp replication + bounded-staleness labels ([ADR-0040](05-config-matching-environments.md#adr-0040)).

### Alternatives considered
- **Backend-of-record with emitted events** (direct read/write to the chosen DB; events a non-authoritative side-channel). Rejected as the default: abandons "data = projections of events" and drops replay/time-travel/audit for domain data — survives only as the **authoritative-external** escape hatch (3) for adopted stores.
- **Strict event-sourcing with no escape hatch.** Rejected: cannot adopt an existing DB as authoritative and forces CQRS on trivial CRUD; incompatible with [ADR-0041](07-portability-extensibility.md#adr-0041) adopt-in-place.
- **A per-backend direct-write ORM (Prisma-style) as the agnostic layer.** Rejected: an ORM over heterogeneous engines still leaks dialect/paradigm, gives no event audit/replay, and can't unify with the reactive/projection machinery.

### Consequences
- **(+)** Developers work a logical model; architects place data on any backend — reusing the reactor/migrations/Matching/replication wholesale (little new machinery: a port, a concept, three events).
- **(+)** Audit, replay, time-travel, and rebuildable read models cover **domain** data, not just control-plane state.
- **(+)** The escape hatch keeps real-world adoption (existing DBs) and CRUD ergonomics viable without abandoning the model.
- **(−)** CQRS + eventual consistency are the normal case: a projection lags the log by its fold/replication latency; reads-your-writes holds within the owning Camp but not instantly across every external sink (CAP-honest, per [ADR-0040](05-config-matching-environments.md#adr-0040)). Per-entity consistency is tunable — see [ADR-0052](#adr-0052).
- **(−)** Two write paths exist (event-sourced default vs authoritative-external) and must be kept legible; `hobo doctor` flagging is the mitigation.
- **(−)** Portability is equivalence-class-bounded — cross-paradigm moves (relational↔document) are not free (see [ADR-0052](#adr-0052)).

## ADR-0051
**WIT is the canonical domain schema; author it in any serialization that compiles to WIT.**

### Context
Three schema systems must converge into one domain/DTO layer: **Zod** validators for step/workflow/query I/O ([Plan 2](../sdk-api.md#plan-02)), **WIT** types for ports ([Plan 24](../wasm-runtime-wit.md#plan-24)), and the **declarative SQL schema** for migrations ([Plan 34](../data-plane.md#plan-34)). The data plane ([ADR-0050](#adr-0050)) needs one **domain/DTO schema** that simultaneously defines event payload shapes, projection read-model shapes, and backend mappings. WIT is the canonical contract and its codegen ([ADR-0037](05-config-matching-environments.md#adr-0037)) already flows from WIT — but app developers reach for familiar serializations (Zod, Protobuf) and need constraints richer than a structural type system expresses.

### Decision
1. **WIT is the canonical domain schema, authored in any serialization that compiles to it.** Domain types/DTOs resolve to **WIT records** ([Plan 24](../wasm-runtime-wit.md#plan-24)), but may be authored as **WIT records, Zod schemas, or Protobuf messages** — each compiles to the same canonical WIT. One record family is the single upstream for event payloads, projection/read-model shapes, and backend mappings, regardless of authoring surface.
2. **Constrain types with CUE, independent of how they're expressed.** Validation/refinement constraints (ranges, formats, cross-field invariants) are declared in **CUE** and apply to the canonical type regardless of authoring serialization — one constraint language across WIT, Zod, and Protobuf inputs.
3. **Generate the rest from canonical WIT** (extending [ADR-0037](05-config-matching-environments.md#adr-0037)'s codegen): **TS types** via `jco guest-types`; **Protobuf** message descriptors as the **wire encoding for event bodies**; **Zod validators** as a runtime-validation view. All deterministic, checked into `_generated/`.
4. **Protobuf is a wire encoding, not the only authoring language.** Event bodies in the `EventEnvelope` ([Plan 11](../event-model.md#plan-11)) are Protobuf-encoded canonical records; whichever serialization authored the type, the wire form is consistent.
5. **One canonical type, many views.** Each domain type yields the TS type, Protobuf encoding, Zod validator, projection shape, CUE constraints, and [Plan 29](../contracts-policy-flags.md#plan-29)'s "Declared" contract from a single upstream.

### Schema versioning
Data/materialization schemas are **contract-tested like service boundaries** using the **PACT contract-testing versioning strategy** — consumer/provider expectations are pinned and verified per version, so a schema change that would break a live consumer is caught before deploy. Migration mechanics follow modern cross-DB practice (see [ADR-0032](#adr-0032) for the expand→backfill→contract apply model): event bodies evolve via [Plan 11](../event-model.md#plan-11) upcasters; projection-sink schemas evolve via [Plan 34](../data-plane.md#plan-34) expand→backfill→contract. A domain-record change wires to both and is gated by its PACT contract.

### Forgetting & data subject rights
**Forward-only / no-history-rewrite is the default but is configurable for GDPR / right-to-be-forgotten.** Where a record must be forgotten, HoBo **crypto-shreds** — destroys the per-subject "forgetting key" so the record's encrypted fields become permanently unrecoverable, anonymizing the record **without rewriting history**. The log stays append-only and replayable; forgotten fields decrypt to tombstones. Right-to-erasure is thus a configurable obligation, not a history rewrite.

### Alternatives considered
- **A single fixed authoring language (WIT-only, or Protobuf-only).** Rejected: forces one ergonomics on every team; allowing Zod/Protobuf/WIT to compile to one canonical WIT keeps the contract single while meeting developers where they are.
- **Zod as the canonical contract.** Rejected: Zod is a TS runtime-validation library, not a language-neutral contract; it can't be the upstream for WIT ports, Protobuf wire, or polyglot guests. It remains a valid *authoring* and *validation* surface that compiles to WIT.
- **Per-language ad-hoc constraints (Zod refinements, Protobuf options, WIT comments).** Rejected: constraints would fork by serialization; CUE gives one constraint language over the canonical type.
- **History rewrite for erasure (delete/overwrite events).** Rejected: breaks replay, audit, and determinism; crypto-shredding anonymizes while keeping the log append-only.

### Consequences
- **(+)** One domain schema → TS + Protobuf + Zod + CUE constraints + projection shape + Declared contract, all generated and consistent; closes the disjoint-schema gap while letting teams author in Zod, Protobuf, or WIT.
- **(+)** Reuses the WIT/jco/codegen machinery; Protobuf gives a compact, evolvable event-body wire format; CUE centralizes constraints.
- **(+)** Polyglot-friendly: canonical WIT records are language-neutral, so non-TS guests share the same domain types.
- **(+)** PACT contract-testing makes schema evolution safe and auditable; crypto-shredding satisfies erasure without abandoning append-only history.
- **(−)** Multiple authoring front-ends plus the Protobuf/Zod/CUE emitters are more codegen to build and keep deterministic ([ADR-0037](05-config-matching-environments.md#adr-0037) drift gate covers them).
- **(−)** Crypto-shredding requires per-subject key management and field-level encryption discipline — a real operational surface, but the honest cost of forget-without-rewrite.

## ADR-0052
**Projection-sink paradigm taxonomy, tunable consistency & the reactivity boundary.**

### Context
A persistence-agnostic data plane ([ADR-0050](#adr-0050)) implies many backend paradigms behind one projection abstraction. Two risks: (a) implying every paradigm is equally well-supported when only some have adapters, and (b) implying every backend can serve **reactive** queries when many cannot (no change-feed; analytical/batch engines). Different entities also need different freshness/consistency guarantees — a strong single default lies about cost; a weak one lies about correctness.

### Decision
1. **Model the projection sink as a paradigm-tagged kind** behind the `hobo:projection` port: a Matching dimension `type: "projection-sink", paradigm: relational|document|kv|wide-column|graph|vector|object-lake|olap|native`. Adding a paradigm is a new adapter behind the **stable port**, not a model change. The core ships **native** (log/standing projection), **relational** (Postgres reference), and **document** (Mongo reference); other paradigms (KV/wide-column, graph, object/data-lake, OLAP/columnar) are adapters behind the same port, and **vector/graph search backends are search extension libraries** ([ADR-0034](#adr-0034)) rather than core paradigms.
2. **Consistency is configurable per entity/materialization** via **Azure Cosmos DB-style tunable consistency levels** (strong, bounded-staleness, session, consistent-prefix, eventual). The **default is session consistency** (reads-your-writes within a Camp); an entity or materialization can dial up to bounded-staleness/strong (at higher latency/cost) or down to eventual (cheaper/faster) per its needs. The level is a `match.Decided` outcome and is honored by the reactor's snapshot@`seq` machinery ([Plan 32](../data-plane.md#plan-32)).
3. **The reactivity boundary, as one rule:** a projection is **reactive iff** its sink advertises the `change-feed` capability **or** it is the native log-backed projection; otherwise it is typed `reactive: false` and `hobo doctor` warns when a `"use query"` depends on it ([Plan 32](../data-plane.md#plan-32)'s existing check). Object-lake and OLAP sinks, and any non-deterministic search ([ADR-0034](#adr-0034)), are **off the reactive path by construction**.
4. **Portability is equivalence-class-bounded** ([Plan 3](../control-plane.md#plan-03)): "same Bindle, N backends" holds *within* a paradigm class (managed-relational, document, …). Cross-*paradigm* portability is **not** guaranteed — the schema mapping is paradigm-specific. Cross-engine *within* a class follows [Plan 34](../data-plane.md#plan-34)'s export→import.
5. **Each sink kind ships a `@hobo/conformance` suite:** claim a paradigm → round-trip a fixture record set, honor the declared consistency level, and, if reactive, emit ordered `data.Changed` ([Plan 24](../wasm-runtime-wit.md#plan-24)/[Plan 9](../verification.md#plan-09)).

### Alternatives considered
- **One fixed consistency model for all entities.** Rejected: a single global level either overpays (strong everywhere) or under-delivers (eventual everywhere); per-entity tunable levels with a session default match real workloads.
- **A relational-only data plane with paradigms bolted on ad hoc.** Rejected: without the taxonomy + stable port, additional paradigms would bend the model; modeling all paradigms behind one port keeps adapters additive.
- **Claim universal reactivity (poll non-change-feed sinks transparently).** Rejected: hidden polling lies about freshness/cost; the explicit `reactive: false` + `hobo doctor` warning is honest.
- **Promise cross-paradigm portability (auto-translate relational↔document).** Rejected: lossy/semantic, not mechanical; equivalence-class bounding keeps the portability guarantee real ([ADR-0024](07-portability-extensibility.md#adr-0024)).

### Consequences
- **(+)** A data architect targets SQL, document, graph, lake, or OLAP behind one developer surface, with the limits stated up front.
- **(+)** Per-entity tunable consistency lets each materialization buy exactly the guarantee it needs; the session default is sane and CAP-honest.
- **(+)** One memorable reactivity rule; developers know which queries live-update before they ship.
- **(+)** Conformance per paradigm keeps adapters trustworthy (the same trust boundary as every other HoBo port).
- **(−)** Non-core paradigms (graph, OLAP, data-lake) need their adapters built — the abstraction exists ahead of every adapter.
- **(−)** Non-reactive paradigms split the developer mental model ("this query won't live-update"); the type flag + `hobo doctor` warning are the mitigation.
- **(−)** Equivalence-class bounding means a relational→document move is a re-model, not a config flip — honest, but not the frictionless any-backend ideal.

## ADR-0053
**CQRS is the opinionated app layer: commands, aggregates, and the actor boundary.**

### Context
[ADR-0050](#adr-0050) makes app domain data event-sourced (commands→events; backends are projections). Event-sourcing needs a **write-side consistency boundary**: a command must check invariants against current state and append without lost updates. The pieces exist — `streamId` is the "aggregate/run/actor key" with optimistic `seq` ([Plan 11](../event-model.md#plan-11)), and an `actor` is a "single-writer entity, state = folded event stream, lease + fencing" ([Plan 2](../sdk-api.md#plan-02)) — but they need to be connected into one stated model with a clear write-side consistency guarantee, honest about CAP ([ADR-0040](05-config-matching-environments.md#adr-0040) rejects silent cross-store strong consistency).

### Decision
1. **CQRS is the opinionated app-layer implementation.** The app layer is **command/query-separated by default**: writes go through commands into aggregates (the write model); reads come from projections/materializations (the read model). This is the default app architecture, not one option among several.
2. **The command's consistency boundary is an aggregate, realized as an actor.** A `command` runs **inside** the single-writer boundary of the aggregate it targets (an [actor](../sdk-api.md#plan-02) keyed by the command's stream id): it loads the aggregate's **write-model fold** (`ctx.state`), checks invariants against current state, and emits events under the aggregate's **lease + fencing + optimistic `seq`** ([Plan 11](../event-model.md#plan-11)). No new primitive — **an aggregate is an actor whose handlers emit domain events**, and `command` is the typed, domain-write sibling of an actor `signal`.
3. **Two folds, one log.** The **aggregate fold** is the authoritative *write* model (in the single-writer, for invariant checks); a **projection fold** ([Plan 39](../data-plane.md#plan-39)/[ADR-0050](#adr-0050)) is the *read* model (derived, in architect-chosen sinks). "Actor state = folded stream" and "projection = folded stream" are the same log, folded for two purposes.
4. **Per-aggregate serializability, not global.** Optimistic `seq` on the aggregate's stream gives serializable writes *within* an aggregate with **no global lock**. **Cross-aggregate** consistency is a **saga** (choreography + compensation, [Plan 2](../sdk-api.md#plan-02)) or eventual ([ADR-0040](05-config-matching-environments.md#adr-0040)); there is no silent distributed transaction across aggregates.
5. **`emit` stays for boundary-free facts.** A naked `ctx.emit` (no aggregate) is valid for domain events that need no invariant check (telemetry-like facts); the **default** domain write goes through a command→aggregate.

### Alternatives considered
- **CRUD/shared-model (no command/query separation).** Rejected as the default: collapses write invariants and read shapes into one model, gives no clean place for the aggregate boundary, and fights the event-sourced log. CQRS is the opinionated default.
- **Commands as naked event appends (no aggregate).** Rejected as the default: no place to enforce invariants, reintroduces lost-update races; fine only for boundary-free facts (5).
- **A new `aggregate(...)` primitive distinct from `actor`.** Rejected: an actor already *is* a single-writer, folded-stream consistency boundary; a second primitive duplicates the model. "Aggregate" is the **role** an actor plays on the write side, not a new noun.
- **Global serializable transactions across aggregates.** Rejected: cross-store/cross-Camp strong consistency is high-latency and partition-prone ([ADR-0040](05-config-matching-environments.md#adr-0040)); sagas + per-aggregate serializability is the honest model.

### Consequences
- **(+)** Invariants, concurrency, and "actor vs command" have one coherent answer — the aggregate/actor boundary — reusing existing primitives (no new mechanism).
- **(+)** CQRS is stated plainly as the opinionated default (write fold vs read fold), making projections and actors two sides of one log.
- **(+)** Serializable *per aggregate* without a global lock; sagas for cross-aggregate flows.
- **(−)** Developers must model aggregate boundaries (what's one consistency unit) — the classic DDD modeling cost; bad boundaries mean either over-large aggregates (contention) or cross-aggregate invariants that need sagas.
- **(−)** Multi-aggregate operations are eventually consistent / saga-coordinated, not atomic — surprising to those expecting RDBMS transactions; documented as a deliberate CAP choice (tunable per [ADR-0052](#adr-0052)).

## ADR-0065
**Streaming-first read surface: RX subscribable materializations, with a GraphQL facade over materialized views and snapshots.**

### Context
HoBo's SDK is **event-based with actor models**: the append-only log is the source of truth, actors fold streams into state, and projections fold streams into read models ([ADR-0003](./README.md)/[ADR-0050](#adr-0050)). For an event-sourced + actor runtime, data is **materialized from streams**, not stored-then-queried; a registration for event types already *is* a subscription; and real-time push is the natural mode. The default read surface should be **subscribe to a stream**, RX-style (reactive-extensions: observable pipelines you compose and subscribe to). Consumers that prefer a request/response query API need an opinionated read facade that does not abandon the stream-native model.

### Decision
**Subscriptions/streams are the default read surface; a GraphQL facade is the opinionated query surface; one-shot queries are escape hatches.** Concretely:

1. **The default read primitive is a subscription to an observable materialization.** `subscribe(materialization | eventTypes) → Observable<T>` replays history up to the current `seq`, then pushes live updates — classic RX "current value + updates" (a `ReplaySubject`/`scan` over the log). The client default is **`useSubscription()`** (an observable that re-renders on push).
2. **A materialization is an RX pipeline over event-type subscriptions.** It is the same artifact as a **projection** ([Plan 39](../data-plane.md#plan-39)) — a deterministic fold over subscribed event types — but its *surface* is a subscribable observable, composed with RX operators (`map`/`filter`/`scan`(fold)/`distinctUntilChanged`/`combineLatest`/`window`/…), not a table you `SELECT` from. **Registration = subscription:** declaring a materialization/handler over event types creates the subscription (its read-set).
3. **The opinionated query surface is a GraphQL facade over materialized views and snapshots.** Request/response reads are served by a **GraphQL facade** that resolves against **materialized views and snapshots** — CQRS querying of materializations produced by **GraphQL reducers** (the reducer is the fold that produces the materialization the resolver reads). This is the default *query* surface (the streaming subscription remains the default *read* surface); GraphQL subscriptions map onto the underlying observable materializations, so query and stream share one model.
4. **Snapshots are cached by default.** A `snapshot(m)` is the one-shot current value of a materialization; snapshots are **cached by default**, so repeated point/query reads hit the cached snapshot rather than re-folding, and the GraphQL facade resolves from cached snapshots/materialized views. Cache freshness follows the entity's tunable consistency level ([ADR-0052](#adr-0052)).
5. **The store is an optional cache.** A **projection sink** ([ADR-0050](#adr-0050)) is an **optional durable, queryable cache** of a materialization, added when you need point-lookups, secondary indexes, search, analytics, or large fan-in. The native log-backed materialization is the default; a sink is opt-in.
6. **Non-stream reads are explicit escape hatches** served from the cache/sink: `snapshot(m)`/`runQuery` (one-shot current value), `repo.get(id)` (point lookup), `view(...).search(...)` ([Plan 35](../data-plane.md#plan-35)), `.raw(driver => …)` (non-portable), and OLAP/batch reads. They are first-class but reached for when a stream subscription is the wrong shape (ad-hoc/point/analytical); `hobo doctor` nudges toward subscriptions for live views.
7. **One engine.** The reactor, consistent-snapshot-@-`seq`, reads-your-writes, the inverted read-set index, coalescing/backpressure, and the `change-feed` capability ([ADR-0029](#adr-0029)) implement the RX subscribable materializations and the GraphQL facade alike. Determinism rules for folds/operators/reducers are the `query()`/`workflow` rules. `useQuery()` is **sugar** for `useSubscription()` over a materialization, not the primary.

### Alternatives considered
- **Query-first as the read surface.** Rejected: it frames an event-sourced runtime like a plain DB-query platform and hides the stream-native model. Streaming is the default read surface; GraphQL is the opinionated *query* facade over materializations.
- **A bespoke REST/query DSL instead of GraphQL.** Rejected: GraphQL's resolver/reducer model maps cleanly onto folds-over-streams and onto materialized views/snapshots, and its subscriptions reuse the same observable materializations — one model, one facade.
- **No query API at all (everything is a stream; point reads = `subscribe().first()`).** Rejected: point-lookup, search, pagination, and OLAP/analytics are awkward or impossible as pure streams; the GraphQL facade + escape hatches over the cache are pragmatic and honest.
- **A separate streaming API alongside an unrelated query API.** Rejected: two divergent read surfaces; instead one model (subscribable materializations) with the GraphQL facade and snapshots as derived query views over it.

### Consequences
- **(+)** The read model matches the event/actor foundation: materialize-from-streams, subscribe-by-default, real-time push without opt-in — with a familiar GraphQL query surface for request/response consumers.
- **(+)** GraphQL reducers + materialized views + cached snapshots give a clean CQRS read facade that shares one model with the streaming surface.
- **(+)** Cached-by-default snapshots make repeated point/query reads cheap; freshness is governed by the tunable consistency level ([ADR-0052](#adr-0052)).
- **(+)** One engine — the GraphQL facade and RX materializations run over the same reactor + projections; consistency guarantees are uniform.
- **(−)** RX is a different mental model than a plain query API; mitigated by the GraphQL facade plus `useQuery`/`repo`/`view` sugar and good docs.
- **(−)** Non-stream-shaped reads (search/OLAP/point) are served from a cache, so they carry the sink's reactivity/consistency caveats ([Plan 39](../data-plane.md#plan-39) honest-limits) — stated, not hidden.
- **(−)** A GraphQL facade plus reducer/materialized-view tracking is real surface to build and keep deterministic; the SDK surface ([Plan 2](../sdk-api.md#plan-02)/[Plan 24](../wasm-runtime-wit.md#plan-24)) leads with `subscribe`/`useSubscription` and exposes the GraphQL facade as the query surface.

## ADR-0032
**Data portability & schema-versioning strategy.**

### Context
HoBo's headline promise is "the same Bindle, N clouds." For *infrastructure* that holds (ports/adapters + the portability conformance guarantee, [ADR-0024](07-portability-extensibility.md#adr-0024)). For **application data** it must hold too: when a `sql` resource's schema changes, or it moves from one provider to another, the platform owns *who* runs the migration, *how* it is gated, and *how* data is carried across — in an event-sourced, gated, multi-cloud model, drawing on modern cross-DB migration practice.

### Decision
1. **Authoring = declarative desired-schema + auto-diff.** The developer declares the target schema (IfC); a diff engine computes a **reviewable migration plan** against the schema live in the target Camp. **Raw per-dialect SQL is an escape hatch**, not the primary surface. Relational `sql` ships with a Postgres reference.
2. **Schema versioning is contract-tested (PACT strategy).** Data/materialization schemas are versioned and **contract-tested like service boundaries** using the **PACT contract-testing versioning strategy** ([ADR-0051](#adr-0051)): consumer/provider expectations are pinned per version, so a change that would break a live consumer is caught before deploy.
3. **Apply = expand → backfill → contract**, each a **gated saga step** at Delta→Set/promote ([Plan 26](../platform-engineering.md#plan-26)). Only **contract** is destructive, and it composes with **`compat.Gate*`** ([Plan 29](../contracts-policy-flags.md#plan-29)) and the PACT contract: a drop that would break a still-running app/consumer version is **blocked**.
4. **Rollback = redeploy the last-good Set + restore a pre-contract snapshot.** Migrations are **forward-only — no `.down` scripts**; expand phases are additive, so an already-running app version keeps running, and a snapshot is taken before any destructive contract phase.
5. **Cross-cloud move = export→import within a provider equivalence class** (managed-Postgres), as a gated event-sourced saga with blue/green cutover ([Plan 5](../reliability-observability-cost.md#plan-05)) + checksum verification + source reap. Cross-engine moves use a CDC/dual-write adapter; portability is bounded to equivalence classes to keep the guarantee real.
6. **Events** `migration.Planned/SnapshotTaken/PhaseApplied/Verified/RolledBack/Failed` + move `migration.Exported/Imported/CutOver` — every step replayable/auditable.
7. **Layering & erasure.** This governs *application* data; the control-plane event log keeps its forward-only upcaster model ([Plan 11](../event-model.md#plan-11)). Forward-only is the default but is configurable for GDPR / right-to-be-forgotten via crypto-shredding ([ADR-0051](#adr-0051)) — erasure anonymizes records by destroying forgetting keys rather than rewriting history.

### Alternatives considered
- **Versioned `.up.sql`/`.down.sql` files.** Rejected as the primary surface: per-dialect (no automatic cross-cloud portability), opaque to the gate (execute-only, can't reason about additive-vs-destructive), and `.down` gives false rollback safety. Retained only as the **raw escape hatch**.
- **Imperative TS migration DSL (`defineMigration` builder).** Rejected: more to build, leaky for advanced SQL, and imperative steps are harder to diff/verify/gate than a declared target schema.
- **Down-migrations as the rollback model.** Rejected: a dropped column's data is already gone, so an inverse can't truly restore it; expand-contract + snapshot is honest about what is and isn't recoverable.
- **Unbounded cross-engine portability (auto-translate Postgres↔MySQL).** Rejected: lossy/semantic, not mechanical; equivalence-class bounding keeps the guarantee real, with CDC/dual-write as the deliberate cross-engine path.
- **App-owned data movement (HoBo only provisions).** Rejected: abdicates the data-portability promise.

### Consequences
- **(+)** The multi-cloud promise extends to **data**: schema evolution and intra-class moves are concrete, gated, contract-tested, and auditable — not infra-only.
- **(+)** Reuses existing machinery — Delta→Set + `can-deploy` ([Plan 26](../platform-engineering.md#plan-26)), `compat.Gate*` + PACT contracts ([Plan 29](../contracts-policy-flags.md#plan-29)/[ADR-0051](#adr-0051)), blue/green + snapshots ([Plan 5](../reliability-observability-cost.md#plan-05)), the event log ([Plan 11](../event-model.md#plan-11)) — so little new infra.
- **(+)** Expand-contract gives safe zero-downtime, forward-only migrations and a clean rollback story without unreliable `.down` scripts.
- **(−)** A declarative diff engine is non-trivial to build and won't cover every DDL operation; the raw escape hatch is the pressure valve.
- **(−)** Portability is bounded to equivalence classes — cross-engine moves go through CDC/dual-write, so some real-world migrations are adapter work.

## ADR-0034
**Generalized, extensible search capability.**

### Context
`vector()` and `search()` appear as SaaS primitives in [Plan 2](../sdk-api.md#plan-02) §53, and `vector` is a `database` *feature* in the capability model ([Plan 3](../control-plane.md#plan-03)) — but there is no port, WIT interface, index/operator/filter model, or equivalence class. **Search is not a fixed, out-of-the-box paradigm.** Apps want different search modalities — full-text, vector/semantic, graph traversal, OWL/Semantic-Web reasoning — and baking any one in as a built-in default would over-commit the core to a paradigm most apps don't use.

### Decision
1. **A generic, extensible `search` port** (`hobo:search`): one stable interface that defines a query/index/filter contract **without committing to a search paradigm**. The core ships a **full-text** capability over the port; everything richer is an **optional extension library**. `.allow()` verbs: `index`/`query`/`admin`.
2. **Vector, graph, OWL/Semantic-Web, hybrid, etc. are optional extension libraries — not built-in defaults.** Each registers a search modality behind the generic port (a `search-extension` Matching dimension), bringing its own index declaration and operators. Vector (pgvector / managed engines), graph traversal, and OWL/RDF reasoning are extensions an app opts into; the core stays paradigm-agnostic. Hybrid search composes installed extensions (e.g. full-text + vector via reciprocal rank fusion) at the port.
3. **Declarative index declaration per modality** (full-text: fields + analyzer + prefix; vector extension: field + `dimensions` + filter fields; graph/OWL extensions: their own schema). An index *is* schema, so it flows through the gated **expand/backfill/contract** migration machinery ([Plan 34](../data-plane.md#plan-34)). Filters use the typed `eq`/`in`/`range` predicate DSL used elsewhere.
4. **Reactivity split by determinism:** deterministic search (full-text + filtered) are **reactive `query()`/`useQuery()`** citizens ([Plan 32](../data-plane.md#plan-32), re-push on `data.Changed`); non-deterministic modalities (vector embedding, external reasoners) run as a **`step`** off the reactive path; hybrid is a `step` fusing a reactive deterministic query with a non-deterministic extension.
5. **An `embed` capability** (`hobo:embed`) for the vector extension auto-embeds rows + text queries, brokered secretlessly ([Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 31](../authoring-resources-wiring.md#plan-31)) and realized **per Camp** (local/in-boundary model for dev/air-gap; hosted API for prod), Matching-selected. **BYO precomputed vectors** is the escape hatch. The pgvector + local-model path is a complete, no-egress option — portability is never gated behind a paid embedder.
6. **No new event types** — reuse `query.*` + `data.Changed`, `migration.*`, and `run.StepCompleted`.

### Alternatives considered
- **Ship full-text + vector + hybrid as a fixed built-in surface.** Rejected: over-commits the core to specific paradigms; a generic port with paradigm-specific extension libraries keeps the core small and lets apps install only what they need.
- **Search-as-a-DB-capability (index on the `database`/`sql` resource).** Rejected: couples search to the DB provider's FTS/vector support, weakens cross-cloud portability, and makes a dedicated managed search engine awkward. The port still *realizes* on pgvector when colocation is best, but the port is first-class and paradigm-agnostic.
- **A separate port per modality (`vector`, `graph`, `search`).** Rejected: duplicates index/filter/declaration machinery and turns hybrid into a cross-port dance; one generic port with extensions unifies them.
- **All search reactive (incl. embedding/reasoning).** Rejected: those calls are external/non-deterministic; reactivity would re-run network calls and break the consistent-snapshot guarantee ([ADR-0029](#adr-0029)).
- **BYO-embedding only.** Rejected as the default for the vector extension (kept as the escape hatch): the `embed` capability makes vector search work out of the box for apps that install it.

### Consequences
- **(+)** A portable, reactive-where-it-can-be search surface that stays paradigm-agnostic: full-text in the core, vector/graph/OWL as opt-in extensions.
- **(+)** Reuses ports/adapters + Matching (ADR-0033), the migration machinery (Plan 34), the reactive reactor (Plan 32), and secretless auth (Plan 31) — minimal new machinery, no new event types.
- **(+)** The local-model `embed` adapter gives an air-gap-friendly, no-egress option for the vector extension.
- **(−)** A generic port plus per-modality extensions means a broad conformance surface (analyzers, vector ops, graph/OWL semantics vary); equivalence-class fidelity is ongoing work per extension.
- **(−)** An embedding-model change is itself an index migration (re-embed) — correct but operationally heavy; flagged as an iteration hook.

## ADR-0059
**App communications: the `notify` family over the shared receiver port.**

### Context
HoBo messages *operators* (ops alerting, [ADR-0045](04-governance-verification.md#adr-0045)) and moves messages *between services* (`topic`/`queue`, [Plan 21](../authoring-resources-wiring.md#plan-21)). A developer's app also needs a first-class, portable, secretless, auditable way to send a verify-email, an OTP SMS, a push, or an outbound webhook to *its* users/customers. Bolting this on per-provider would reintroduce static API keys, untyped payloads, no consent enforcement, and no delivery audit — exactly the anti-patterns HoBo's planes exist to remove.

### Decision
1. **A `notify` capability family** (`email`/`sms`/`push`/`webhookOut`) behind a single **`hobo:notify`** port, with `.allow("send")` and providers (SES/SendGrid/Twilio/FCM/APNs/signed-webhook) as **secretless-brokered adapters** ([Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 31](../authoring-resources-wiring.md#plan-31)).
2. **One port, two consumers.** App communications **reuses the ADR-0045 receiver port + adapters**; ops alerting and app comms are the same transport with different policy/audit/addressing. A provider adapter is written once and serves both.
3. **Recipients are `PrincipalRef`s** ([Plan 36](../ai-native-agent-auth.md#plan-36)) and **templates are WIT records** ([ADR-0051](#adr-0051)) — identity/consent and typed payloads ride the existing models; `send` is a memoized `step` (idempotent, no double-send on retry).
4. **Sends are event-sourced** (`notification.Requested/Sent/Delivered/Bounced/Failed`) → auditable, reactive (`useQuery()` delivery status, [Plan 32](../data-plane.md#plan-32)), and retry/compensatable ([Plan 5](../reliability-observability-cost.md#plan-05)).
5. **Policy-gated** ([Plan 30](../contracts-policy-flags.md#plan-30)): rate limits and quiet-hours are `policy.Decided`/obligations (deferral is a durable effect, not advice); **consent/opt-out** is a generic policy-obligation example — not a product feature.

### Alternatives considered
- **A separate notification microservice / port unrelated to ops alerting.** Rejected: duplicates the receiver-port + adapter work; two SendGrid integrations to maintain. Sharing the port is the cheap, coherent choice.
- **Untyped `send(to, body)` with raw provider keys.** Rejected: reintroduces static secrets, untyped payloads, and no consent/audit — the precise anti-patterns the secretless/WIT-record/policy planes remove.
- **Make notifications a kind of `topic`.** Rejected: `topic` is intra-app pub/sub between components; human-facing delivery needs consent, channel addressing, delivery receipts, and quiet-hours — a different contract. They compose (a `topic` subscriber may `notify`) but aren't the same resource.
- **Build a full marketing-automation / campaign engine.** Rejected — out of scope: campaign/marketing orchestration is a business/SaaS function, not meta-cloud infrastructure ([ADR-0064](08-scope-and-requirements.md#adr-0064)). `notify` is a thin transactional send port.

### Consequences
- **(+)** Closes the most common SaaS gap with almost no new machinery — one port + one event family + catalog rows, riding the existing receiver port, broker, log, and policy plane.
- **(+)** Secretless + typed + consent-gated + auditable by default; delivery status is reactive for free; compliance ([Plan 46](../governance-planes.md#plan-46)) gets "who did we contact, when" as replayable evidence.
- **(+)** Air-gap-friendly: degrades to in-boundary SMTP/relay; unsupported channels surface in the capability-degradation matrix ([ADR-0036](07-portability-extensibility.md#adr-0036)).
- **(−)** Provider deliverability nuances (warmup, DKIM/SPF, carrier rules) live in adapters — HoBo standardizes the *contract*, not every provider's quirks.
- **(−)** Consent/preference modeling carries a modeling choice (built-in projection vs app-owned aggregate) that each app makes explicitly.
