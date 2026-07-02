# WIT Port Stub Contract — Architecture Evidence

This draft package carries architecture-guard evidence for HOBO-651 (`stub()` behind
any WIT port).

## Schema And Constraints

- Protobuf data shapes live in [`architecture/`](./architecture).
- CUE constraints bound every protobuf type in that schema.
- A PACT contract under [`architecture/pacts/`](./architecture/pacts) records the
  package boundary.

## Parse, Don't Validate

Untrusted port call payloads cross one parser boundary: operation input/output
validators reject schema-invalid values before they become trace entries or
`stub.Recorded` events. Downstream replay consumes parsed trace entries only.

## Event Architecture

| Event | Role |
|---|---|
| `link.Established` | Stub link registered with `boundaryMode: "mock"` (ADR-0076) |
| `stub.Recorded` | Each stubbed call records args + typed response |
| `link.Called` | Membrane routing audit for the import call |
| `stub.ReplayCompleted` | S1-12 harness stand-in finished deterministic replay |

Recorded traces are the materialized view consumers replay through the harness;
Camp event-store persistence is out of scope for this POC.
