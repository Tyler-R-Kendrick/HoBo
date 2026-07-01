# @hobo/runtime-local — Architecture Evidence

Production Wasmtime runtime-local component host (S1-02 / HOBO-591),
SQLite-backed Camp EventStore port (S1-05 / HOBO-594), and Streamer runtime
port with replay-then-live reads (S1-08 / HOBO-597).

## Schema and constraints

- Protobuf records live in [`data-models/`](./data-models).
- CUE constraints bound every protobuf type in that folder.
- PACT consumer evidence lives under [`contracts/`](./contracts).

## Parse, don't validate

Raw descriptors cross `src/parse.ts` once and become parsed derived types
(`ParsedComponentDescriptor`, `ParsedProviderDescriptor`, `ParsedLinkRequest`).
Downstream host code never re-checks raw DTO strings; invalid interface ids and
empty ids are unrepresentable past the parser boundary.

Untrusted EventStore caller input crosses `src/eventstore/parse.ts` once into
derived types (`ParsedStreamId`, `ParsedEventInput`, `ParsedAppendContext`,
`ParsedExpectedSeq`). Store internals and SQLite adapters accept only parsed
values; persisted rows re-enter through `parseStoredEnvelope` →
`parseEventEnvelope`.

Streamer inputs cross parser boundaries in `@hobo/core` (`parseRunId`,
`parseStreamName`, `parseSeq`) and return derived branded types. The frame
journal and local streamer adapter accept only parsed types at their seams.

## Component host — event architecture

- **Command** — `LoadComponent`, `RegisterProvider`, `LinkImport`, `InvokeLinkedImport`,
  `HandleHttp`, `TeardownComponent` requests enter the host port.
- **Event** — successful operations append `component.Loaded`, `link.Established`,
  `link.Called`, `component.Invoked`, `component.Trapped`, or `component.TornDown`
  to the injected event-log sink.
- **Actor** — the runtime-local host actor owns link-table and lifecycle state.
- **Event store** — the append-only sink passed via `appendEvent` is the source of truth.
- **Materialized view / projection** — `linkTable()`, `lifecycle()`, and `activeLeases()`
  fold applied events into queryable host state.
- **Snapshot** — current link records and lifecycle entries are projection snapshots.
- **Read store** — callers query `linkTable()` / `lifecycle()` instead of replaying the log.

The internal `eventMirror` array exists only as a test convenience; production callers
must treat the append-only sink as authoritative.

## wRPC link layer (S1-03 / HOBO-592)

- Port types live in `@hobo/core` (`ports/wrpc-link.ts`).
- Implementation lives in `src/wrpc/` (`link-layer.ts`, `in-process-transport.ts`, `wire-version.ts`).
- Membrane PACT evidence: [`contracts/wrpc-membrane.pact.json`](./contracts/wrpc-membrane.pact.json).
- Protobuf + CUE records: [`data-models/wrpc_link.proto`](./data-models/wrpc_link.proto), [`data-models/wrpc_link.cue`](./data-models/wrpc_link.cue).

## Capability enforcement (S1-04 / HOBO-593)

- Port types and grant evaluation live in `@hobo/core` (`src/capability/`).
- Link-table enforcement lives in `src/capability/link-table.ts`.
- PACT evidence: [`contracts/capability-grant-gate.pact.json`](./contracts/capability-grant-gate.pact.json).
- Protobuf + CUE records: [`data-models/capability_link_table.proto`](./data-models/capability_link_table.proto), [`data-models/capability_link_table.cue`](./data-models/capability_link_table.cue).

`createCapabilityLinkTable` accepts parsed `CapabilityGrant` values from `@hobo/core`
at the boundary. Enforcement appends `link.Established`, `link.Called`, and
`capability.GrantDenied` events via the injected event sink; the link table never
mutates read models directly.

## Binding resolver (S1-15 / HOBO-605)

- Port type lives in `@hobo/core` (`ports/binding-resolver.ts`).
- Local adapter lives in `src/binding-resolver.ts` (`createLocalBindingResolver`).
- PACT evidence consumed by `@hobo/camps`: [`../camps/contracts/pacts/local-runtime-binding-resolver.pact.json`](../camps/contracts/pacts/local-runtime-binding-resolver.pact.json).

## EventStore — command / event families

- **Command** — SDK/runtime callers invoke `append` with `expectedSeq` and
  `EventInput` facts.
- **Event** — accepted commands persist `aggregate.PastTenseFact` envelopes in
  the append-only log.
- **Quarantine audit facts** — `*.Quarantined` events record poison-handler
  failures (`offendingSeq`, `offendingType`, `reason`) without mutating prior
  rows.

## EventStore — actor / projection behavior

- **Actor** — the `actor` principal on each envelope names who emitted the
  fact; actors append events, never mutate read models directly.
- **Event store** — `events` table is the durable source of truth (WAL +
  `synchronous=FULL`, one transaction per append batch).
- **Materialized view / projection** — `fold` replays the log through handlers
  to derive state; downstream reactors/projections (Plan 32) consume the same
  log.
- **Snapshot** — `snapshots` table caches fold state at a `seq` for faster
  replay (snapshots + cache, not always from seq 0).
- **Read store** — callers query fold output or snapshots; the raw log remains
  append-only.

## Streamer — event architecture (S1-08 / HOBO-597)

- **Command** — `createRun`, `getRun`, `write`, and `teardownRun` requests.
- **Event** — append-only lifecycle records `StreamRunOpened` / `StreamRunClosed`
  folded into run state; per-frame payloads ride the Streamer journal, not the
  EventStore log (Plan 11).
- **Actor** — upstream workflow/CLI producers write frames through
  `getWritable(stream)`.
- **Event store** — lifecycle transitions only; frame bodies stay in the in-memory
  append-only journal until teardown.
- **Materialized view / projection** — readers iterate replay-then-live frames
  from independent cursors.
- **Snapshot** — mid-run attach via `getRun(runId).read({ fromSeq })` backfills
  journaled frames before joining the live tail.
- **Read store** — consumers read frames from the Streamer port; the Yard is never
  on the streaming data path.

Per-frame messages ride the **Streamer**, not the durable event log. Run
lifecycle is event-sourced; frame retention is dev-grade in-memory until
`teardownRun` releases the run.

## Contracts

- EventStore PACT evidence: [`contracts/pacts/runtime-sdk-eventstore.pact.json`](./contracts/pacts/runtime-sdk-eventstore.pact.json).
- Streamer PACT evidence: [`contracts/streamer-port.pact.json`](./contracts/streamer-port.pact.json).

Runtime-local uses Node's built-in `node:sqlite` adapter for the durable
EventStore, so package type support must stay on Node 24 or newer. Pact replay
tests load package-local fixtures from [`contracts/`](./contracts) so the
capability, EventStore, and Streamer contracts remain self-contained with this
runtime.
