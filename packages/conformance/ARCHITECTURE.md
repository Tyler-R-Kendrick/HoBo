# @hobo/conformance — Architecture Evidence

S0-01 scaffold package. Validates workspace boundary rules and carries
architecture-guard evidence for the production `packages/conformance` root.

## Schema and constraints

- Protobuf records live in [`data-models/`](./data-models).
- CUE constraints bound every protobuf type in that folder.
- PACT consumer/provider evidence lives under [`contracts/pacts/`](./contracts/pacts).

## Parse, don't validate

`parseWorkspaceEdge` and related helpers apply parse, don't validate at the
boundary: untrusted edge DTOs become derived parsed types before boundary
validation runs. CUE constraints on `WorkspaceEdgeRecord` and
`WorkspaceSkeletonValidatedEvent` reject malformed input at parse time.

## Event architecture

- **Command** — validate workspace skeleton imports and topology.
- **Event** — `WorkspaceSkeletonValidatedEvent` records the validation outcome.
- **Actor** — conformance harness actor applies validation commands.
- **Event store** — validation events append to the platform event store.
- **Materialized view / projection** — boundary violation list is the projection.
- **Snapshot** — latest validated workspace rev is the read snapshot.
- **Read store** — CI and adapters query the read store for boundary status.

The harness implements parse/refinement tests; runtime projection is deferred to
later conformance slices.
