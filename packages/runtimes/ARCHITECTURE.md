# packages/runtimes — Architecture Evidence

Parent workspace for runtime host packages (`@hobo/runtime-local`, future lattice hosts).

## Schema and constraints

- Protobuf records live in [`data-models/`](./data-models).
- CUE constraints bound every protobuf type in that folder.
- PACT consumer/provider evidence lives under [`contracts/`](./contracts).

## Parse, don't validate

`@hobo/runtime-local` `createCapabilityLinkTable` accepts parsed `CapabilityGrant`
values from `@hobo/core` at the boundary. Invalid grants are unrepresentable past
`parseCapabilityGrant`; the link table never re-validates raw DTOs. Parse,
don't validate: constrained manifest and grant input becomes derived parsed types
before enforcement runs.

## Event architecture

- **Command** — link, issueHandle, callWithHandle route capability calls.
- **Event** — `link.Established`, `link.Called`, `capability.GrantDenied` append
  via the injected event sink.
- **Actor** — runtime-local link-table actor owns route registration.
- **Event store** — host append-only log receives enforcement events.
- **Materialized view / projection** — link table routes are a projection of
  applied link events.
- **Snapshot** — registered components/providers are read snapshots.
- **Read store** — conformance and host adapters query route state.

Implementation: `runtime-local/src/capability/link-table.ts`.
