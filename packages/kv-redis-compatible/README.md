# `@hobo/kv-redis-compatible`

Provider-neutral authoring and conformance for Redis-compatible key/value
storage.

This package names no product. It contains no provider identifier, imports no
provider package, and nothing in its public API lets a caller express a
preference for one. A Bindle asks for `kv.redis-compatible/v1` semantics;
Matching decides who serves it.

## What it gives you

### Authoring

```ts
import { redisCompatible, valkey } from "@hobo/kv-redis-compatible";

const cache = redisCompatible.store({
  ttl: true,
  atomicIncrement: true,
  minValueBytes: 64 * 1024,
});

const valkeyStore = valkey.store({ sortedSets: true });
```

Both return a parsed `CapabilityRequirement` from `@hobo/capability-profiles`.
`redisCompatible.store()` targets `kv.redis-compatible/v1`; `valkey.store()`
targets its `kv.valkey/v1` refinement. Both always demand the
`redisCommandSemantics` guarantee, so a product that exposes GET and SET over
HTTP and calls it Redis does not qualify.

An explicit `false` means "do not care", not "must not have". A prohibition
would rule out a perfectly good store that happens to support more than you
asked for.

### Conformance

The suite is data. A case is a list of command templates and expectations; the
thing that talks to a store is injected:

```ts
import { runKvRedisConformance, toProfileImplementations } from "@hobo/kv-redis-compatible";

const report = await runKvRedisConformance({
  executor,                       // your KvRedisExecutor
  transport: "rest",              // "rest" | "resp" | "in-process"
  limits: { maxValueBytes: 1_048_576 },
  keyPrefix: "run-42:",           // keeps a live run off application keys
});

const implementations = toProfileImplementations(report, { conformanceRef });
```

Twenty cases across six areas: `transport`, `key-value`, `ttl`, `atomicity`,
`bounded-payload`, and `consistency`. The scope is deliberately closed —
command transport, the key/value data types, expiry, the atomic operations the
profile promises, behaviour at a declared payload bound, and the consistency a
single client can actually observe.

Three rules keep a report from over-claiming:

1. **A case that could not run is `skipped`, never `pass`.** No time control
   means the expiry case is skipped rather than assumed. No declared value-size
   limit means the bounded-payload cases are skipped rather than invented.
2. **A run with any skipped required case is `incomplete`,** and `incomplete`
   projects to `conformance: "unknown"`, which selection fails closed on.
3. **A capability is substantiated only when every case that substantiates it
   passed.** One of two is not evidence.

`restTransport` is the one capability the cases cannot establish, because it is
a property of how the run reached the store rather than of any command. The
runner adds it only when `transport: "rest"`.

### Consistency, honestly

`KV_REDIS_CONSISTENCY_CLAIMS` records what the suite asserts *and what it
refuses to*:

| Property | Asserted | Why |
|---|---|---|
| `readYourWrites` | yes | `consistency.read-your-writes` |
| `monotonicSequentialWrites` | yes | `consistency.monotonic-counter-in-session` |
| `linearizableAcrossClients` | **no** | needs concurrent clients and a real-time ordering oracle |
| `durableAcrossFailover` | **no** | needs an induced node failure |
| `crossRegionReplicationBound` | **no** | a deployment property, not a Redis semantic |

A provider that copies this list without adding its own evidence inherits the
`no` rows too.

### Redis data structures are not delivery guarantees

Redis has lists, streams, and pub/sub. None of them is a queue or a topic:

- `LPUSH`/`RPOP` has no acknowledgement, no redelivery, no visibility timeout,
  and no dead-letter path. A consumer that dies after `RPOP` has silently
  dropped the message — exactly what `queue.at-least-once/v1` exists to rule out.
- Redis pub/sub reaches whoever is connected at publish time and retains
  nothing, so it is `topic.ephemeral-pubsub/v1` at best and never
  `topic.durable-log/v1`.
- Streams are closer, but consumer groups, offsets, and retention are their own
  semantics with their own failure modes and their own conformance.

`KV_REDIS_NON_IMPLIED_PROFILES` names the four profiles this package explicitly
does not imply, `explainNonImplication` says why for each, and
`assertNoQueueTopicImplication` is the parse-boundary guard a provider calls on
its own declaration at module load.

The guard checks the *conformance reference*, not the profile list. A product
implementing both a store and a queue is legitimate; one conformance run
standing behind both is not.

`test/separation.test.ts` drives `selectCapabilityImplementation` with a
reference candidate that advertises the whole Redis data-type surface and shows
it is rejected with `PROFILE_INCOMPATIBLE` for `queue.at-least-once/v1`,
`queue.fifo/v1`, `topic.pubsub/v1`, `topic.durable-log/v1`, and
`topic.ephemeral-pubsub/v1`.

## The reference store

`createReferenceRedisStore()` is a deterministic in-memory implementation of
exactly the semantics the suite asserts. Time is arithmetic rather than sleep,
so the expiry case is exact rather than flaky.

It is not a Redis, and it is not here to be one. It exists for two jobs:

- The suite is run against it both intact and deliberately broken
  (`breakVerb`), because a conformance suite nobody has run against a
  known-good implementation is a suite whose passing result means nothing.
- An adapter author can point a REST or RESP transport at it and run the whole
  suite through their adapter, offline. That proves the *adapter* — envelope
  encoding, argument round-tripping, error mapping — without anyone's staging
  cluster. It proves nothing about the real server behind that adapter.

## Parse, don't validate

Every input crosses one parse boundary and becomes a derived domain type the
rest of the package accepts without re-checking:

| Raw input | Parser | Derived type | Impossible afterwards |
|---|---|---|---|
| store options | `redisCompatible.store`, `valkey.store` | a parsed `CapabilityRequirement` | an ask that omits `redisCommandSemantics` |
| a declared limit | `resolveFillSizes` | `FillSizes` | a bounded-payload case running against an invented bound |
| a command template | `resolveCommand` | `RedisCommand` (verb plus resolved arguments) | an unresolved `fill` placeholder reaching an executor |
| an executor reply | `evaluateExpectation` | a `StepResult` | a thrown exception being read as "the store rejected it" |
| a provider declaration | `assertNoQueueTopicImplication` | a checked declaration | one conformance reference standing behind a store *and* a queue |

`runKvRedisConformance` takes the parsed command, never the template, which is
why there is no code path that forgets to apply the key prefix and no code path
that applies it twice.

The protobuf records in `data-models/kv_redis_conformance.proto` are the wire
projection of these parsed types, and `kv_redis_conformance.cue` carries the
invariants that keep a report from over-claiming: a skipped case records no
steps, a passing case cannot contain a failing step, any failed case forces
`fail`, and any skip without a failure forces `incomplete`.

## Event architecture

The suite is pure data and the runner performs no I/O beyond the injected
executor, so nothing here appends anything. A run becomes durable through the
control plane:

- **Commands** — `RunKvConformance` carries the suite reference, the transport,
  and the declared limits; the resulting `ConformanceReport` is what a
  `RecordProvisionedSubject` or `RotateCapabilityBinding` command in
  `@hobo/claims` can then cite as evidence for a `kv.redis-compatible/v1`
  resource.
- **Events** — the coordinator **actor** (`reduce` in `@hobo/claims`) emits
  `ProviderSubjectProvisioned`, `OwnershipVerified`, and
  `CapabilityBindingRotated`; the conformance outcome recorded in those bodies is
  exactly this package's `pass` / `fail` / `incomplete`, projected to
  `pass` / `fail` / `unknown`. Event bodies carry the report record, never a
  connection string — the executor holds the credential and the suite never sees
  one.
- **Event store** — the host appends to the durable SQLite-backed **event store**
  under per-stream OCC and a fencing token. The conformance run itself happens
  outside that transaction, keyed by the run's `keyPrefix`, so a retried run
  cannot collide with the keys of the previous one.
- **Projections / materialized views** — the stream folds into the
  **materialized views** selection reads: substantiated capability keys per
  product, and the current outcome per profile claim.
  `toProfileImplementations` is the shape of that view, which is why an
  `incomplete` run fails selection closed instead of ranking lower.
- **Snapshots / read store** — periodic **snapshots** of the resource aggregate
  back the **read store** behind `hobo status`; historical snapshots keep the
  conformance reference a product was selected under auditable after a later run
  changes the current one.

## Testing

```bash
pnpm --filter @hobo/kv-redis-compatible run build
pnpm --filter @hobo/kv-redis-compatible run test
```

Everything runs offline. There is no live lane.

## Layout

| Path | Contents |
|---|---|
| `src/requirement.ts` | `redisCompatible.store`, `valkey.store` |
| `src/protocol.ts` | command/reply model, expectation evaluation, the `KvRedisExecutor` port |
| `src/cases.ts` | the case catalog and the consistency claims |
| `src/runner.ts` | the runner, the report, and the projections into profile implementations |
| `src/separation.ts` | the queue/topic non-implication rules and guard |
| `src/reference-store.ts` | the deterministic reference store adapters validate against |
| `contracts/` | the consumer-driven contract the executor must satisfy, prose in `README.md` and executable in `pacts/kv-redis-executor.pact.json` |
| `data-models/` | protobuf records for the case and report shapes, plus the CUE invariants over them |
