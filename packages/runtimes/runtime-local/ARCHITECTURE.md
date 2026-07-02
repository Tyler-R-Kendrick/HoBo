# @hobo/runtime-local — Architecture Evidence

Production Wasmtime runtime-local component host (S1-02 / HOBO-591).

## Schema and constraints

- Protobuf records live in [`data-models/`](./data-models).
- CUE constraints bound every protobuf type in that folder.
- PACT consumer evidence lives under [`contracts/`](./contracts).

## Parse, don't validate

Raw descriptors cross `src/parse.ts` once and become parsed derived types
(`ParsedComponentDescriptor`, `ParsedProviderDescriptor`, `ParsedLinkRequest`).
Downstream host code never re-checks raw DTO strings; invalid interface ids and
empty ids are unrepresentable past the parser boundary.

## Event architecture

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
