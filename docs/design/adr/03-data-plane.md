# Data plane, reactivity, schema & app capabilities — consolidated decisions

> Consolidated ADR decisions for **data plane, reactivity, schema & app capabilities**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0029
**Reactive / live-query model (event-log reactor).** Accepted (reframed by [ADR-0065](#adr-0065) — the reactor engine is unchanged; the *default surface* is now subscriptions/streams (RX materializations), with queries as snapshots/escape hatches)

- **Origin:** the competitor gap analysis flagged a **reactive/live-query data model** (Convex's core DX) as HoBo's one true blind spot. Designed via brainstorming + grill-with-docs.

### Context
Convex's headline DX — `useQuery()` that auto-recomputes and pushes to every client on write, with consistent snapshots — works because queries are **deterministic functions over one built-in database**, tracked by a reactor that records each query's read-set. HoBo cannot copy this directly: it is **event-sourced** (the log is already a change stream and projections already exist) and **multi-cloud** (app data lives in *provider* databases that vary — there is no single DB to reactor over). HoBo needs reactivity that fits its log-first, portable, multi-cloud model without forcing a single database.

### Decision
Build a **reactor on the event log**, with three locked choices:
1. **Hybrid source.** Reactive queries run over the **event log / projections** by default (native, portable, zero extra infra, works on any Camp runtime). Provider databases join via an **opt-in `change-feed` capability** on the `database` port, normalized into `data.Changed` events so the *same* reactor handles DB-backed queries. v1 ships the capability interface + one reference adapter (Postgres); sources without a change feed are typed non-reactive.
2. **Per-query consistent snapshot @ `seq` + reads-your-writes.** Each pushed result is computed at a single monotonic log position; pushes are delivered in `seq` order (clients never regress); a mutation returns its `seq` and the client's subscriptions advance to ≥ it before the write acks. *Not* global serializability (too costly across multiple streams + providers).
3. **A deterministic, read-only `query()` primitive + `"use query"` directive** (sibling to `step`/`workflow`/`"use training"`), with the runtime auto-tracking the read-set per execution, surfaced to clients as a typed `useQuery()` hook (+ `subscribe`/`runQuery`). Optimistic updates supported.

### Alternatives considered
- **Provider-DB change feeds only (most Convex-like).** Rejected as the *default*: it's provider-specific, needs CDC for every backend, and isn't portable; kept as the opt-in capability.
- **Just realtime event push (pub/sub), no query reactivity.** Rejected: doesn't close the DX gap (no derived/consistent query results), though it's a strict subset the reactor subsumes.
- **Global serializable snapshots (single-reactor semantics).** Rejected for v1: expensive/hard across multiple streams + multi-provider; per-query consistent snapshots give Convex's feel at far lower cost.
- **Subscribe-to-named-projections only (no new primitive).** Rejected: only pre-declared views would be reactive — less flexible and less Convex-like than an app-defined `query()`.

### Consequences
- **(+)** Closes the one mainstream-DX gap vs Convex while staying log-first, portable across Camps/runtimes, and multi-cloud-safe; reuses the event log + `Streamer` + projections HoBo already has.
- **(+)** Reactivity inherits HoBo's superpowers — replay, audit, determinism — and the `change-feed` capability rides the existing conformance trust boundary.
- **(−)** A new always-on data-plane component (the `Reactor`, renamed from `QueryReactor` by [ADR-0065](#adr-0065)) with fan-out, coalescing, and backpressure to engineer ([Plan 5](../05-reliability-ha.md)); a hot stream can wake many subscriptions (mitigated by the inverted stream→subscription index + sharding).
- **(−)** DB-backed reactivity is only as good as each provider's change feed; coverage beyond the Postgres reference adapter is incremental, and cross-Camp reactive queries are deferred (open [Q16](../09-verification-open-questions.md)).
- **Resolves** open question #21; **enabled** reactive search (#22), now specified in [Plan 35](../35-search-vector-surface.md)/[ADR-0034](#adr-0034) (full-text/filtered search re-pushes on `data.Changed`; vector search is a step).

## ADR-0050
**Event-sourced-by-default app domain data; backends are projection sinks.** Accepted (reframed by [ADR-0065](#adr-0065) — a projection is a **subscribable materialization**; the backend sink is an **optional cache**, not the default query target)

- **Origin:** the data-plane question — make persistence agnostic for developers while giving data architects full autonomy. Designed via brainstorming.

### Context
HoBo already bets that the append-only event log is the single source of truth, with projections rebuilt by folding it ([Plan 11](../11-event-model.md)) — but only for HoBo's *own* control-plane state. Application **domain data** lived in provider `sql`/`kv`/`bucket` stores the developer wrote to directly (raw `ctx.bindings.db.query(...)`), separate from the log and not event-sourced. That left the data layer persistence-*coupled* (dialect-leaky access, no logical model) and left "the data layer is projections of events" true only for actor state. The question: what is the system of record for app domain data, and how literally do we take "projections of events"?

### Decision
1. **App domain data is event-sourced by default.** Domain writes are **commands → events** appended to the log ([Plan 11](../11-event-model.md)); the log is the source of truth for domain data, exactly as it already is for control-plane state.
2. **Every database is a derived projection sink.** A **projection** ([Plan 39](../39-data-plane-projections.md)) folds WIT-record-typed event streams into a read model and materializes it into an architect-chosen backend (SQL/NoSQL/KV/graph/vector/object-lake/OLAP) via a **schema mapping**. The developer owns the logical read-model record + queries; the **data architect owns the mapping + the backend**, selected via **Matching** ([Plan 25](../25-resource-definitions-matching.md)) and recorded in `match.Decided`. Projections are **rebuildable from zero** (replay), the test that the log — not the sink — is authoritative.
3. **An explicit adopt-in-place escape hatch.** An existing/external DB can be declared **authoritative-external** via [ADR-0041](07-portability-extensibility.md#adr-0041) (`hobo import`, `external` kind, `echo` driver): the DB is the source of truth (not the log), writes go to it directly, and its `change-feed` (if any) feeds `data.Changed` so reactive reads still work. `hobo doctor` flags long-lived authoritative-external stores as migration debt. This is what makes strangler-fig adoption possible without forcing CQRS on day one.
4. **Resolve [Plan 11](../11-event-model.md)'s open question** — "read models in the same store or a separate query DB" — as **architect-selected per context via Matching**, default = a native standing projection over the log; opt a projection into an external sink when a purpose-built query backend is wanted. Same-store vs separate-query-DB is a `match.Decided` outcome, not a global architectural fork.
5. **Reuse, don't reinvent:** the reactor, `data.Changed`, read-set tracking, snapshot@`seq`, and reads-your-writes ([Plan 32](../32-reactive-live-queries.md)); gated expand→backfill→contract for sink schema ([Plan 34](../34-app-data-migrations.md), where rebuild-from-zero *is* a backfill); single-writer-Camp replication + bounded-staleness labels ([ADR-0040](05-config-matching-environments.md#adr-0040)).

### Alternatives considered
- **Backend-of-record with emitted events** (direct read/write to the chosen DB; events a non-authoritative side-channel). Rejected as the default: abandons "data = projections of events" and drops replay/time-travel/audit for domain data — though it survives as the **authoritative-external** escape hatch (3) for adopted stores.
- **Strict event-sourcing with no escape hatch.** Rejected: cannot adopt an existing DB as authoritative and forces CQRS on trivial CRUD; incompatible with [ADR-0041](07-portability-extensibility.md#adr-0041) adopt-in-place.
- **A per-backend direct-write ORM (Prisma-style) as the agnostic layer.** Rejected: an ORM over heterogeneous engines still leaks dialect/paradigm, gives no event audit/replay, and can't unify with the reactive/projection machinery HoBo already has.

### Consequences
- **(+)** Realizes the user's intent — developers work a logical model; architects place data on any backend — by *finishing* Plan 11's bet into the app layer, reusing the reactor/migrations/Matching/replication wholesale (little new machinery: a port, a concept, three events).
- **(+)** Audit, replay, time-travel, and rebuildable read models now cover **domain** data, not just control-plane state.
- **(+)** The escape hatch keeps real-world adoption (existing DBs) and CRUD ergonomics viable without abandoning the model.
- **(−)** CQRS + eventual consistency become the normal case: a projection lags the log by its fold/replication latency; reads-your-writes holds within the owning Camp but not instantly across every external sink (CAP-honest, per [ADR-0040](05-config-matching-environments.md#adr-0040)).
- **(−)** Two write paths exist (event-sourced default vs authoritative-external) and must be kept legible; `hobo doctor` flagging is the mitigation.
- **(−)** Portability is equivalence-class-bounded — cross-paradigm moves (relational↔document) are not free (see [ADR-0052](#adr-0052)).

## ADR-0051
**WIT records as the canonical domain schema (TS + protobuf + Zod generated).**

- **Origin:** the data-plane design needs a single domain-schema/DTO layer; today Zod (I/O), WIT (ports), and the declarative SQL schema are disjoint. Designed via brainstorming.

### Context
HoBo had three schema systems that never met: **Zod** validators for step/workflow/query I/O ([Plan 2](../02-sdk-api.md)), **WIT** types for ports ([Plan 24](../24-wit-interfaces-reference.md)), and the **declarative SQL schema** for migrations ([Plan 34](../34-app-data-migrations.md)). The new data plane ([ADR-0050](#adr-0050)) needs one **domain/DTO schema** that simultaneously defines event payload shapes, projection read-model shapes, and backend mappings. The user's original intent named protobuf for DTOs in event bodies; HoBo's existing canonical contract is WIT, and its codegen ([ADR-0037](05-config-matching-environments.md#adr-0037)) already flows from WIT.

### Decision
1. **WIT records are the canonical domain schema.** Domain types/DTOs are authored as **WIT records** ([Plan 24](../24-wit-interfaces-reference.md)) — HoBo's existing canonical contract — making one record family the single upstream for event payloads, projection/read-model shapes, and backend mappings.
2. **Generate everything else from the WIT record** (extending [ADR-0037](05-config-matching-environments.md#adr-0037)'s codegen): **TS types** via `jco guest-types` (existing path); **protobuf** message descriptors as the **wire encoding for event bodies** (new emitter); **Zod validators** as a runtime-validation view (new emitter). All deterministic, checked into `_generated/`.
3. **protobuf is an encoding, not the authoring language.** Event bodies in the `EventEnvelope` ([Plan 11](../11-event-model.md)) are protobuf-encoded WIT records; developers never hand-author protobuf or `.proto` as the source of truth.
4. **Domain DTOs are WIT-first; Zod is generated for them.** Hand-written Zod remains valid for ad-hoc, non-domain step I/O, but domain DTOs are no longer Zod-first. This makes the WIT record the single upstream for the TS type, protobuf encoding, Zod validator, projection shape, and [Plan 29](../29-contracts-compatibility.md)'s "Declared" contract.
5. **Evolution stays split and explicit:** event bodies evolve via [Plan 11](../11-event-model.md) upcasters (forward-only, never rewrite history); projection-sink schemas evolve via [Plan 34](../34-app-data-migrations.md) expand→backfill→contract. A domain-record change wires to both.

### Alternatives considered
- **protobuf/IDL as the canonical authoring schema** (the original idea). Rejected as the *authoring* language: it would add a second schema system alongside WIT/Zod and is less ergonomic for the TS-first SDK — but its strengths (compact wire format, strict evolution) are captured by generating protobuf *encodings* from WIT.
- **Zod-first (status quo extended to domain data).** Rejected: Zod is a TS runtime-validation library, not a language-neutral contract; it can't be the upstream for WIT ports, protobuf wire, or polyglot guests, and would fork the contract story.
- **A bespoke HoBo schema language now.** Rejected/deferred: WIT already is the canonical contract; a friendlier authoring surface is the future [Hobo Code](../38-hobo-code-dsl.md) DSL, which can author the same records without changing this decision.

### Consequences
- **(+)** One domain schema → TS + protobuf + Zod + projection shape + Declared contract, all generated and consistent; closes the disjoint-schema gap.
- **(+)** Reuses the existing WIT/jco/codegen machinery and the canonical-contract stance; protobuf gives a compact, evolvable event-body wire format without a second authoring surface.
- **(+)** Polyglot-friendly: WIT records are language-neutral, so non-TS guests share the same domain types.
- **(−)** Two new codegen emitters (WIT→protobuf, WIT→Zod) to build and keep deterministic ([ADR-0037](05-config-matching-environments.md#adr-0037) drift gate covers them).
- **(−)** WIT records are a less familiar authoring surface than TS interfaces for app developers; the generated TS types and (future) Hobo Code DSL mitigate this.
- **(−)** WIT's type system is the ceiling for domain types until Hobo Code adds sugar; rich TS-only constructs must be modeled within WIT records.

## ADR-0052
**Projection-sink paradigm taxonomy & the reactivity boundary.**

- **Origin:** the data plane must support many persistence paradigms (data lake, SQL, NoSQL, graph, vectorDB) honestly; we need to fix what ships v1 vs roadmap and a clear rule for when a projection is reactive. Designed via brainstorming.

### Context
A persistence-agnostic data plane ([ADR-0050](#adr-0050)) implies many backend paradigms behind one projection abstraction. Two risks: (a) pretending every paradigm is equally first-class in v1 when only a few have adapters, and (b) implying every backend can serve **reactive** queries when many cannot (no change-feed; analytical/batch engines). [Plan 35](../35-search-vector-surface.md) already set the precedent that *vector search is non-reactive (a step)* while text/filter search is reactive — we generalize that honesty across all paradigms.

### Decision
1. **Model the projection sink as a paradigm-tagged kind** behind the `hobo:projection` port: a Matching dimension `type: "projection-sink", paradigm: relational|document|kv|wide-column|graph|vector|object-lake|olap|native`. Adding a paradigm is a new adapter behind the **stable port**, not a model change.
2. **v1 ships a subset; the rest is named roadmap.** **v1:** **native** (log/standing projection), **relational** (Postgres reference), **one document** (Mongo reference), and **vector** (via [Plan 35](../35-search-vector-surface.md)'s `search`). **Roadmap:** KV/wide-column, graph, object/data-lake, OLAP/columnar.
3. **The reactivity boundary, as one rule:** a projection is **reactive iff** its sink advertises the `change-feed` capability **or** it is the native log-backed projection; otherwise it is typed `reactive: false` and `hobo doctor` warns when a `"use query"` depends on it ([Plan 32](../32-reactive-live-queries.md)'s existing check). Consequently vector search, object-lake, and OLAP are **off the reactive path by construction**.
4. **Portability is equivalence-class-bounded** ([Plan 3](../03-providers-iac.md)): "same Bindle, N backends" holds *within* a paradigm class (managed-relational, document, …). Cross-*paradigm* portability is **not** guaranteed — the schema mapping is paradigm-specific. Cross-engine *within* a class follows [Plan 34](../34-app-data-migrations.md)'s export→import.
5. **Each sink kind ships a `@hobo/conformance` suite:** claim a paradigm → round-trip a fixture record set and, if reactive, emit ordered `data.Changed` ([Plan 24](../24-wit-interfaces-reference.md)/[Plan 9](../09-verification-open-questions.md)).

### Alternatives considered
- **Ship only relational v1, add paradigms ad hoc later.** Rejected: without the taxonomy + stable port now, later paradigms would bend the model; modeling all paradigms up front keeps adapters additive.
- **Claim universal reactivity (poll non-change-feed sinks transparently).** Rejected: hidden polling lies about freshness/cost; the explicit `reactive: false` + `hobo doctor` warning is honest (matches [Plan 35](../35-search-vector-surface.md)'s vector-as-step stance).
- **Promise cross-paradigm portability (auto-translate relational↔document).** Rejected: lossy/semantic, not mechanical; equivalence-class bounding keeps the portability guarantee real ([ADR-0024](07-portability-extensibility.md#adr-0024)).

### Consequences
- **(+)** A data architect can target SQL today and graph/lake/OLAP later behind the same developer surface, with the limits stated up front.
- **(+)** One memorable reactivity rule; developers know which queries live-update before they ship.
- **(+)** Conformance per paradigm keeps adapters trustworthy (the same trust boundary as every other HoBo port).
- **(−)** Several high-value paradigms (graph, OLAP, data-lake) are roadmap, not v1 — the abstraction exists but the adapters don't yet.
- **(−)** Non-reactive paradigms split the developer mental model ("this query won't live-update"); the type flag + `hobo doctor` warning are the mitigation.
- **(−)** Equivalence-class bounding means a relational→document move is a re-model, not a config flip — honest, but not the frictionless any-backend ideal.

## ADR-0053
**Write-side consistency: commands, aggregates, and the actor boundary.**

- **Origin:** [Plan 39](../39-data-plane-projections.md)'s `command` emitted events with no stated invariant boundary or concurrency control, while HoBo already had **actors** ("state = folded event stream, single-writer lease") and **sagas** (event choreography) — leaving "where do write-side invariants live, and when do I use an actor vs a command?" ambiguous. Designed via analysis of the existing primitives.

### Context
[ADR-0050](#adr-0050) made app domain data event-sourced (commands→events; backends are projections). But event-sourcing needs a **write-side consistency boundary**: a command must check invariants against current state and append without lost updates. HoBo already has the pieces — `streamId` is described as the "aggregate/run/actor key" with optimistic `seq` ([Plan 11](../11-event-model.md)), and an `actor` is a "single-writer entity, state = folded event stream, lease + fencing" ([Plan 2](../02-sdk-api.md)) — but Plan 39's `command` example didn't connect them, and there was no statement of what consistency a write gets. Convex answers this with serializable mutations on its document DB; HoBo needs its own answer that is honest about CAP ([ADR-0040](05-config-matching-environments.md#adr-0040) rejects silent cross-store strong consistency).

### Decision
1. **The command's consistency boundary is an aggregate, realized as an actor.** A `command` runs **inside** the single-writer boundary of the aggregate it targets (an [actor](../02-sdk-api.md) keyed by the command's stream id): it loads the aggregate's **write-model fold** (`ctx.state`), checks invariants against current state, and emits events under the aggregate's **lease + fencing + optimistic `seq`** ([Plan 11](../11-event-model.md)). No new primitive — **an aggregate is an actor whose handlers emit domain events**, and `command` is the typed, domain-write sibling of an actor `signal`.
2. **Two folds, one log (CQRS, named).** The **aggregate fold** is the authoritative *write* model (in the single-writer, for invariant checks); a **projection fold** ([Plan 39](../39-data-plane-projections.md)/[ADR-0050](#adr-0050)) is the *read* model (derived, in architect-chosen sinks). "Actor state = folded stream" and "projection = folded stream" are the same log, folded for two purposes.
3. **Per-aggregate serializability, not global.** Optimistic `seq` on the aggregate's stream gives serializable writes *within* an aggregate with **no global lock** — the CAP-honest analog of Convex's serializable mutations. **Cross-aggregate** consistency is a **saga** (choreography + compensation, [Plan 2](../02-sdk-api.md)) or eventual ([ADR-0040](05-config-matching-environments.md#adr-0040)); HoBo never offers a silent distributed transaction across aggregates.
4. **`emit` stays for boundary-free facts.** A naked `ctx.emit` (no aggregate) remains valid for domain events that need no invariant check (telemetry-like facts); the **default** domain write goes through a command→aggregate.

### Alternatives considered
- **Commands as naked event appends (no aggregate).** Rejected as the default: gives no place to enforce invariants and reintroduces lost-update races; fine only for boundary-free facts (4).
- **A new `aggregate(...)` primitive distinct from `actor`.** Rejected: an actor already *is* a single-writer, folded-stream consistency boundary; adding a second primitive duplicates the model. "Aggregate" is the **role** an actor plays on the write side, not a new noun (keeps the primitive set small, consistent with reusing "projection" rather than minting terms).
- **Global serializable transactions across aggregates** (Convex-style, but distributed). Rejected: cross-store/cross-Camp strong consistency is high-latency and partition-prone ([ADR-0040](05-config-matching-environments.md#adr-0040)); sagas + per-aggregate serializability is the honest model.

### Consequences
- **(+)** Closes the write-side gap: invariants, concurrency, and "actor vs command" now have one coherent answer — the aggregate/actor boundary — reusing existing primitives (no new mechanism).
- **(+)** CQRS is stated plainly (write fold vs read fold), making Plan 39's projections and Plan 2's actors obviously two sides of one log.
- **(+)** Honest, competitive framing vs Convex: serializable *per aggregate* without a global lock, sagas for cross-aggregate flows.
- **(−)** Developers must model aggregate boundaries (what's one consistency unit) — the classic DDD modeling cost; bad boundaries mean either over-large aggregates (contention) or cross-aggregate invariants that need sagas.
- **(−)** Multi-aggregate operations are eventually consistent / saga-coordinated, not atomic — surprising to those expecting RDBMS transactions; documented as a deliberate CAP choice.

## ADR-0065
**Streaming-first: RX subscribable materializations as the default read surface.** Accepted (reframes [ADR-0029](#adr-0029) and [ADR-0050](#adr-0050) — the engine is unchanged; the *default surface* becomes subscriptions/streams, not queries)

### Context
HoBo's SDK is **event-based with actor models**: the append-only log is the source of truth, actors fold streams into state, and projections fold streams into read models ([ADR-0003](./README.md)/[ADR-0050](#adr-0050)). The read surface, however, was framed **query-first** — `view()/repo()` "query a projection by logical name," with reactivity bolted on via `"use query"` ([ADR-0029](#adr-0029)). That mirrors how Convex/Lakebed work: *query a database; the platform re-runs the query on change.*

For an event-sourced + actor runtime that is the wrong default. Data is **materialized from streams**, not stored-then-queried; a registration for event types already *is* a subscription; and real-time push is the natural mode, not an opt-in. The default read surface should be **subscribe to a stream**, RX-style (reactive-extensions: observable pipelines you compose and subscribe to), with query-a-store as the escape hatch.

### Decision
**Subscriptions/streams are the default; queries are an escape hatch.** Concretely:

1. **The default read primitive is a subscription to an observable materialization.** `subscribe(materialization | eventTypes) → Observable<T>` replays history up to the current `seq`, then pushes live updates — classic RX "current value + updates" (a `ReplaySubject`/`scan` over the log). The client default is **`useSubscription()`** (an observable that re-renders on push).
2. **A materialization is an RX pipeline over event-type subscriptions.** It is the same artifact as a **projection** ([Plan 39](../39-data-plane-projections.md)) — a deterministic fold over subscribed event types — but its *surface* is a subscribable observable, composed with RX operators (`map`/`filter`/`scan`(fold)/`distinctUntilChanged`/`combineLatest`/`window`/…), not a table you `SELECT` from. **Registration = subscription:** declaring a materialization/handler over event types creates the subscription (its read-set).
3. **Streaming by default.** Every materialization is reactive by construction over the native log; the question is no longer "is this query reactive?" but "where is this materialization *cached*?"
4. **The store demotes to an optional cache.** A **projection sink** ([ADR-0050](#adr-0050)) is no longer "the database you query" — it is an **optional durable, queryable cache** of a materialization, added when you need point-lookups, secondary indexes, search, analytics, or large fan-in. The native log-backed materialization is the default; a sink is opt-in.
5. **Query / point-read / search / analytics are explicit escape hatches** served from the sink cache: `snapshot(m)`/`runQuery` (one-shot current value), `repo.get(id)` (point lookup), `view(...).search(...)` ([Plan 35](../35-search-vector-surface.md)), `.raw(driver => …)` (non-portable), and OLAP/batch reads. They are first-class but **not the default** — you reach for them when a stream subscription is the wrong shape (ad-hoc/point/analytical), and `hobo doctor` nudges toward subscriptions for live views.
6. **The engine is unchanged.** The reactor, consistent-snapshot-@-`seq`, reads-your-writes, the inverted read-set index, coalescing/backpressure, and the `change-feed` capability ([ADR-0029](#adr-0029)) all stand — they are now described as the *implementation of RX subscribable materializations*. Determinism rules for folds/operators are the existing `query()`/`workflow` rules. `useQuery()` is retained as **sugar** for `useSubscription()` over a materialization (Convex familiarity), not the primary.

### Alternatives considered
- **Keep query-first (status quo, ADR-0029).** Rejected: it frames an event-sourced runtime like a DB-query platform, hiding the stream-native model and matching Convex/Lakebed instead of differentiating from them.
- **Purist: everything is a stream, no query API at all** (point reads = `subscribe().first()`). Rejected for v1: point-lookup, full-text/vector **search**, pagination, and OLAP/analytics are awkward or impossible as pure streams; keeping them as escape hatches over the sink cache is pragmatic and honest. (Streaming is the *default*, not the *only* surface.)
- **A separate streaming API alongside the query API.** Rejected: two parallel read surfaces invite divergence; instead one model (subscribable materializations) with query as a derived snapshot.

### Consequences
- **(+)** The read model matches the SDK's event/actor foundation: materialize-from-streams, subscribe-by-default, real-time push without opt-in.
- **(+)** Sharper differentiation vs Convex/Lakebed: *they query a database; HoBo gives you subscribable RX materializations over the event log*, portable across Camps.
- **(+)** No new engine — a surface/framing reorientation over the existing reactor + projections; the consistency guarantees are preserved verbatim.
- **(−)** RX is a different mental model than `useQuery`; mitigated by keeping `useQuery`/`repo`/`view` as familiar sugar/escape hatches and good docs.
- **(−)** Non-stream-shaped reads (search/OLAP/point) are escape hatches over a cache, so they carry the sink's reactivity/consistency caveats ([Plan 39](../39-data-plane-projections.md) honest-limits) — stated, not hidden.
- **(↔)** ADR-0029/0050 are reframed (not superseded); Plan 32 is retitled "Reactive streams & subscriptions"; Plan 39 reframes sinks as caches; the SDK surface ([Plan 2](../02-sdk-api.md)/[Plan 24](../24-wit-interfaces-reference.md)) leads with `subscribe`/`useSubscription`.

## ADR-0032
**Data portability & schema-versioning strategy.**

- **Origin:** the gap analysis and open question Q15 found HoBo's multi-cloud premise was **infra-only** — it could provision a DB on any cloud but had no story for migrating the *schema and data* or gating it. Designed via brainstorming + grill-with-docs.

### Context
HoBo's headline promise is "the same Bindle, N clouds." For *infrastructure* that holds (ports/adapters + the portability conformance guarantee, [ADR-0024](07-portability-extensibility.md#adr-0024)). For **application data** it did not: when a `sql` resource's schema changes, or when it moves from one provider to another, *who* runs the migration, *how* is it gated, and *how* is the data carried across? Competitors ship concrete answers (Nitric `migrations/<db>/*.up.sql`; Humanitec preview migration support). HoBo needs a story that fits its event-sourced, gated, multi-cloud model — and that is **distinct from** how HoBo evolves its *own* event log (forward-only upcasters, never rewrite history, [Plan 11](../11-event-model.md)).

### Decision
1. **Authoring = declarative desired-schema + auto-diff.** The developer declares the target schema (IfC); a diff engine computes a **reviewable migration plan** against the schema live in the target Camp. **Raw per-dialect SQL is an escape hatch**, not the primary surface. (v1 scope: relational `sql`, Postgres reference.)
2. **Apply = expand → backfill → contract**, each a **gated saga step** at Delta→Set/promote ([Plan 26](../26-environments-deltas.md)). Only **contract** is destructive, and it composes with **`compat.Gate*`** ([Plan 29](../29-contracts-compatibility.md)): a drop that would break a still-running app/consumer version is **blocked**.
3. **Rollback = redeploy the prior Set + restore a pre-contract snapshot.** **No `.down` migrations** — expand phases are additive, so the prior app version still runs; a snapshot is taken before any destructive contract phase.
4. **Cross-cloud move = export→import within a provider equivalence class** (managed-Postgres), as a gated event-sourced saga with blue/green cutover ([Plan 5](../05-reliability-ha.md)) + checksum verification + source reap. **Cross-engine is out of scope v1; CDC/dual-write is a future opt-in adapter.**
5. **Events** `migration.Planned/SnapshotTaken/PhaseApplied/Verified/RolledBack/Failed` + move `migration.Exported/Imported/CutOver` — every step replayable/auditable.
6. **Explicit layering:** this governs *application* data; HoBo's *own* control-plane event log keeps its forward-only upcaster model ([Plan 11](../11-event-model.md)). The two are named distinctly to avoid conflation.

### Alternatives considered
- **Versioned `.up.sql`/`.down.sql` files (Nitric-parity).** Rejected as the primary surface: per-dialect (no automatic cross-cloud portability), opaque to HoBo (execute-only, can't reason about additive-vs-destructive for the gate), and `.down` gives false rollback safety. Retained only as the **raw escape hatch**.
- **Imperative TS migration DSL (`defineMigration` builder).** Rejected: more to build, leaky for advanced SQL, and imperative steps are harder to diff/verify/gate than a declared target schema.
- **Down-migrations as the rollback model.** Rejected: a dropped column's data is already gone, so an inverse can't truly restore it; expand-contract + snapshot is honest about what is and isn't recoverable.
- **Cross-engine portability (Postgres↔MySQL) in v1.** Rejected: lossy/semantic, not mechanical; portability is scoped to **equivalence classes** to keep the guarantee real.
- **App-owned data movement (HoBo only provisions).** Rejected: abdicates the data-portability promise Q15 exists to address.

### Consequences
- **(+)** The multi-cloud promise now extends to **data**: schema evolution and intra-class moves are concrete, gated, and auditable — not infra-only.
- **(+)** Reuses existing machinery — Delta→Set + `can-deploy` ([Plan 26](../26-environments-deltas.md)), `compat.Gate*` ([Plan 29](../29-contracts-compatibility.md)), blue/green + snapshots ([Plan 5](../05-reliability-ha.md)), the event log ([Plan 11](../11-event-model.md)) — so little new infra.
- **(+)** Expand-contract gives safe zero-downtime migrations and a clean rollback story without unreliable `.down` scripts.
- **(−)** A declarative diff engine is non-trivial to build and won't cover every DDL operation; the raw escape hatch is the pressure valve.
- **(−)** Portability is bounded to equivalence classes — cross-engine moves and CDC cutover are deferred, so some real-world migrations remain manual or future-adapter work.

## ADR-0034
**Search & vector surface.**

- **Origin:** the gap analysis (G2/Q22) found HoBo *named* `vector()`/`search()` but never specified them, while Convex ships full-text + vector search first-class. Designed via brainstorming + grill-with-docs.

### Context
`vector()` and `search()` appear only as SaaS primitives in [Plan 2](../02-sdk-api.md) §53, and `vector` is a `database` *feature* in the capability model ([Plan 3](../03-providers-iac.md)) — but there is **no port, no WIT interface, no index/operator/filter model, and no equivalence class**. Meanwhile [Plan 32](../32-reactive-live-queries.md) explicitly deferred "reactive search" pending this. A Convex-style TS-backend audience expects search as a built-in, so the surface must be specified to be credible.

### Decision
1. **A first-class unified `search` port** (`hobo:search`) covering **full-text + vector + hybrid (RRF)** in one interface — not three separate ports and not bolted onto the `database` port. It is realized by a provider **equivalence class** (pgvector + Postgres-FTS ↔ OpenSearch / Azure AI Search / Pinecone / Turbopuffer), selected per context by **Matching** ([ADR-0033](05-config-matching-environments.md#adr-0033)). `.allow()` verbs: `index`/`query`/`admin`.
2. **Declarative index declaration** (text index: fields + analyzer + prefix; vector index: field + `dimensions` + filter fields). An index *is* schema, so it flows through the gated **expand/backfill/contract** migration machinery ([Plan 34](../34-app-data-migrations.md)).
3. **Reactivity split by determinism:** full-text + filtered search are deterministic → **reactive `query()`/`useQuery()`** citizens ([Plan 32](../32-reactive-live-queries.md), re-push on `data.Changed`); **vector search is a `step`** (external embedding = non-deterministic, off the reactive path); **hybrid is a `step`** fusing a reactive text query + a vector step via reciprocal rank fusion. Filters use the same typed `eq`/`in`/`range` predicate DSL used elsewhere.
4. **An `embed` capability** (`hobo:embed`) behind the port auto-embeds rows + text queries, brokered secretlessly ([Plan 6](../06-ai-native-agent-auth.md)/[Plan 31](../31-config-secretless-secrets.md)) and realized **per Camp** (local/in-boundary model for dev/air-gap; hosted API for prod), Matching-selected. **BYO precomputed vectors** is the escape hatch. The pgvector + local-model path is a complete, no-egress default — portability is never gated behind a paid embedder.
5. **No new event types** — reuse `query.*` + `data.Changed`, `migration.*`, and `run.StepCompleted`.

### Alternatives considered
- **Search-as-a-DB-capability (index on the `database`/`sql` resource, Convex's model).** Rejected as the structure: couples search to the DB provider's FTS/vector support, weakens cross-cloud portability, and makes a dedicated managed search engine awkward. (HoBo still *realizes* the port with pgvector when colocation is best — but the port is first-class.)
- **Two separate ports (`vector` + `search`).** Rejected: duplicates index/filter/declaration machinery and turns hybrid search into a cross-port dance.
- **All search reactive (incl. vector).** Rejected: the embedding call is external/non-deterministic; reactivity would re-run network calls and break the consistent-snapshot guarantee ([ADR-0029](#adr-0029)).
- **All search non-reactive (step only).** Rejected: drops the live full-text DX Plan 32 teed up and that Convex ships.
- **BYO-embedding only.** Rejected as the default (kept as the escape hatch): less batteries-included and off-message for an AI-native platform; the `embed` capability makes vector search "just work."

### Consequences
- **(+)** Closes the one mainstream data gap (G2/Q22) with a portable, reactive-where-it-can-be surface; unblocks Plan 32's deferred reactive search.
- **(+)** Reuses ports/adapters + Matching (ADR-0033), the migration machinery (Plan 34), the reactive reactor (Plan 32), and secretless auth (Plan 31) — minimal new machinery, no new event types.
- **(+)** The local-model `embed` adapter gives an air-gap-friendly, no-egress default (relates to G6/Q20).
- **(−)** A unified port spanning pgvector → managed engines means a broad conformance surface (FTS analyzers + vector ops vary by backend); equivalence-class fidelity is the ongoing work.
- **(−)** An embedding-model change is itself an index migration (re-embed) — correct but operationally heavy; flagged as an iteration hook.

## ADR-0059
**App communications: the `notify` family over the shared receiver port.**

- **Origin:** a coverage sweep for a "more complete design" found the catalog had intra-app messaging (`topic`/`queue`) and ops-only alert receivers, but **no app-facing way to message a human** — the most common SaaS need.

### Context
HoBo could message *operators* (ops alerting, ADR-0045) and move messages *between services* (`topic`/`queue`, Plan 21), but a developer's app had no first-class, portable, secretless, auditable way to send a verify-email, an OTP SMS, a push, or an outbound webhook to *its* users/customers. Bolting this on per-provider would reintroduce static API keys, untyped payloads, no consent enforcement, and no delivery audit — exactly the anti-patterns HoBo's planes exist to remove.

### Decision
1. **A `notify` capability family** (`email`/`sms`/`push`/`webhookOut`) behind a single **`hobo:notify`** port, with `.allow("send")` and providers (SES/SendGrid/Twilio/FCM/APNs/signed-webhook) as **secretless-brokered adapters** ([Plan 6](../06-ai-native-agent-auth.md)/[Plan 31](../31-config-secretless-secrets.md)).
2. **One port, two consumers.** App communications **reuses the ADR-0045 receiver port + adapters**; ops alerting and app comms are the same transport with different policy/audit/addressing. A provider adapter is written once and serves both.
3. **Recipients are `PrincipalRef`s** ([Plan 36](../36-end-user-auth.md)) and **templates are WIT records** ([ADR-0051](#adr-0051)) — identity/consent and typed payloads ride the existing models; `send` is a memoized `step` (idempotent, no double-send on retry).
4. **Sends are event-sourced** (`notification.Requested/Sent/Delivered/Bounced/Failed`) → auditable, reactive (`useQuery()` delivery status, [Plan 32](../32-reactive-live-queries.md)), and retry/compensatable ([Plan 5](../05-reliability-ha.md)).
5. **Policy-gated** ([Plan 30](../30-policy-plane.md)): rate limits and quiet-hours are `policy.Decided`/obligations (deferral is a durable effect, not advice); **consent/opt-out** is a generic policy-obligation example — not a product feature.

### Alternatives considered
- **A separate notification microservice / port unrelated to ops alerting.** Rejected: duplicates the receiver-port + adapter work; two SendGrid integrations to maintain. Sharing the port is the cheap, coherent choice.
- **Untyped `send(to, body)` with raw provider keys.** Rejected: reintroduces static secrets, untyped payloads, and no consent/audit — the precise anti-patterns the secretless/WIT-record/policy planes remove.
- **Make notifications a kind of `topic`.** Rejected: `topic` is intra-app pub/sub between components; human-facing delivery needs consent, channel addressing, delivery receipts, and quiet-hours — a different contract. They compose (a `topic` subscriber may `notify`) but aren't the same resource.
- **Build a full marketing-automation / campaign engine.** Rejected — out of scope: campaign/marketing orchestration is app-build-out, not meta-cloud infrastructure ([ADR-0064](08-scope-and-requirements.md#adr-0064)). `notify` is a thin transactional send port.

### Consequences
- **(+)** Closes the most common SaaS gap with almost no new machinery — one port + one event family + catalog rows, riding the existing receiver port, broker, log, and policy plane.
- **(+)** Secretless + typed + consent-gated + auditable by default; delivery status is reactive for free; compliance ([Plan 46](../46-compliance-governance.md)) gets "who did we contact, when" as replayable evidence.
- **(+)** Air-gap-friendly: degrades to in-boundary SMTP/relay; unsupported channels surface in the capability-degradation matrix ([ADR-0036](07-portability-extensibility.md#adr-0036)).
- **(−)** Provider deliverability nuances (warmup, DKIM/SPF, carrier rules) live in adapters — HoBo standardizes the *contract*, not every provider's quirks.
- **(−)** Consent/preference modeling has product surface still to settle (built-in projection vs app-owned aggregate) — an iteration hook.
