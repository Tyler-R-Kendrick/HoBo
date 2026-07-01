# @hobo/core — Architecture Evidence

S0-01 scaffold package. Carries architecture-guard evidence for the production
`packages/core` root.

## Schema and constraints

- Protobuf records live in [`data-models/`](./data-models).
- CUE constraints bound every protobuf type in that folder.
- PACT consumer/provider evidence lives under [`contracts/pacts/`](./contracts/pacts).

## Parse, don't validate

Untrusted input crosses one parser boundary into derived domain types. Downstream
code receives parsed derived types instead of re-checking raw DTOs. CUE
constraints reject malformed values at parse time.

## Event architecture

- **Command** — request to record or change core scaffold state.
- **Event** — successful commands append domain events to the log.
- **Actor** — owning aggregate applies events in order.
- **Event store** — durable source of truth for accepted events.
- **Materialized view / projection** — folds the event store into queryable state.
- **Snapshot** — current scaffold record is the projection snapshot.
- **Read store** — consumers query the read store, not the raw event log.

No runtime engine is implemented here; this names the boundaries for later S0
slices.
