# S4-08 Portability Conformance Lane — Architecture Evidence

This draft package carries the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`.

## Schema And Constraints

- Protobuf data shapes live in [`architecture/`](./architecture).
- CUE constraints bound every protobuf type in that schema.
- A PACT contract under [`architecture/pacts/`](./architecture/pacts) records the package boundary.

## Parse, Don't Validate

Untrusted conformance evidence is parsed once at the lane boundary into derived report types.
Downstream CI consumers receive `PortabilityConformanceReport` and NFR-020 lint results instead of
re-checking raw fixture bytes.

## Event Architecture

- **Command** — `RunNfr001PortabilityLane` with multi-cloud-shop evidence.
- **Event** — `conformance.Nfr001PortabilityLanePassed` or `deployment.PlanRejected`.
- **Actor** — the conformance lane aggregate owns pass/fail disposition.
- **Materialized view** — the lane report is the query surface for CI and stage gates.

No runtime engine is implemented here; this names the boundaries production `@hobo/conformance`
must implement.
