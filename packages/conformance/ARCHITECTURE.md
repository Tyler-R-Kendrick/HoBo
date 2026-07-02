# @hobo/conformance — Architecture Evidence

Production conformance package. It preserves the S0-01 workspace-boundary
scaffold and adds the HOBO-585 port-suite harness for golden-IR capture, replay
comparison, deterministic seed checks, coverage manifests, provenance, and
claimed-port listing/blocking disposition.

## Schema and constraints

- Protobuf records live in [`data-models/`](./data-models).
- CUE constraints bound every protobuf type in that folder.
- PACT consumer/provider evidence lives under [`contracts/`](./contracts).

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

The port-suite runner appends `conformance.RunStarted`,
`conformance.CaseChecked`, `conformance.CoverageEvaluated`, and
`conformance.RunCompleted` events; `projectPortSuiteReport` derives the
`PortSuiteReport` read model from that append-only log.
