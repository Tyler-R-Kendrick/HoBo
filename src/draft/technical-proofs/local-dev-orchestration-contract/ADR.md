# Local Dev Orchestration Contract — Architecture Evidence

This draft package carries the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`, stating how its data is parsed and
how its records map onto the platform's event flow.

## Schema And Constraints

- Protobuf data shapes live in [`architecture/`](./architecture).
- CUE constraints bound every protobuf type in that schema.
- A PACT contract under [`architecture/pacts/`](./architecture/pacts) records the
  package's boundary.

## Parse, Don't Validate

This package applies the **parse, don't validate** discipline: untrusted manifest
input is parsed once at the boundary into a derived local-dev graph, and the
orchestrator consumes only parsed resources with normalized annotation gates.

## Event Architecture

The package's local lifecycle is a small event flow:

- **Command** — `hobo dev` session start / manual `hobo dev start <resource>`.
- **Event** — `local.Starting`, `local.Ready`, `local.StartFailed`.
- **Actor** — per-resource local orchestrator state keyed by resource id.
- **Materialized view** — `activationLog` and `state` snapshots returned to callers.

No runtime engine, projector, or event store is implemented here; this is a
design-time contract naming the command, event, and projection boundaries for
HOBO-694.
