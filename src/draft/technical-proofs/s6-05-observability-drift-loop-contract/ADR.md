# S6-05 Observability Drift Loop — Architecture Evidence

This draft package carries the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`, stating how its data is parsed and
how its records map onto the platform's event flow.

## Schema And Constraints

- Protobuf data shapes live in [`architecture/`](./architecture).
- CUE constraints bound every protobuf type in that schema.
- A PACT contract under [`architecture/pacts/`](./architecture/pacts) records the
  package's boundary.

## Parse, Don't Validate

Untrusted input is parsed once at the boundary into derived domain types
(resource drift signals, SLO definitions, alert signals). Downstream consumers
receive parsed types from existing contract modules (`slo-as-code-contract`,
`autonomous-drift-remediation-contract`, `alertmanager-routing-contract`) rather
than re-checking raw DTOs.

## Event Architecture

The E2E lane composes event flows from upstream contracts:

- **Telemetry** — deploy/run spans and structured logs correlate through W3C
  `traceparent` on command/event envelopes.
- **SLO burn** — `slo.BudgetBurned` feeds AlertManager-style `alert.Fired` /
  `alert.Routed` events.
- **Drift loop** — `resource.DriftDetected` from periodic resync routes to
  `drift.RemediationRouted`, `drift.DiffProposed`, or `drift.Ignored` per policy.

No runtime engine is implemented here; this is a design-time contract composing
existing proof seams for HOBO-660 acceptance.
