# S4 Stage Gate Multi Cloud Contract — Architecture Evidence

This draft package carries the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`.

## Schema And Constraints

- Protobuf data shapes live in [`architecture/`](./architecture).
- CUE constraints bound every protobuf type in that schema.
- A PACT contract under [`architecture/pacts/`](./architecture/pacts) records the package boundary.

## Parse, Don't Validate

Untrusted drill input is parsed once at the boundary into derived evidence types.
Downstream gate verification consumes those parsed records instead of re-checking raw DTOs.

## Event Architecture

- **Command** — run the S4 stage gate drill against `examples/multi-cloud-shop`.
- **Event** — `s4StageGate.DrillPassed` or `deployment.PlanRejected`.
- **Actor** — the stage gate verifier aggregate.
- **Projection** — the drill report attached to the S4-01 acceptance record.

No runtime engine is implemented here; this is a design-time contract naming the
command, event, and projection boundaries for Stage 4 closure.
