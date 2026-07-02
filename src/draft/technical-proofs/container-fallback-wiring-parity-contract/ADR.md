# Container Fallback Wiring Parity Contract — Architecture Evidence

This draft package carries the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`, stating how its data is parsed and
how its records map onto the platform's event flow.

## Schema And Constraints

- Protobuf data shapes live in [`architecture/`](./architecture).
- CUE constraints bound every protobuf type in that schema.
- A PACT contract under [`architecture/pacts/`](./architecture/pacts) records the
  package's boundary.

## Parse, Don't Validate

Untrusted manifest input is parsed once at the boundary through the bind-reference
and hobo-manifest validators. Wiring parity comparisons operate on derived
`WiringProjection` records so runtime-mode swaps cannot smuggle primitive env
strings past the seam.

## Event Architecture

The conformance report is the read model behind a small event flow:

- **Command** — `deployment.RuntimeModeSwapped` records a component↔container swap.
- **Event** — successful swaps append `deployment.WiringParityAsserted`.
- **Actor** — the manifest IR registry actor owns wiring invariants.
- **Projection** — `runContainerFallbackWiringConformance()` folds accepted manifests
  into the wiring parity report consumers query.

No runtime engine is implemented here; this is a design-time contract naming the
command, event, actor, and projection boundaries for later promotion.
