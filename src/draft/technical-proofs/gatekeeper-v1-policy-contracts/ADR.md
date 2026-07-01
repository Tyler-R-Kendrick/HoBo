# Gatekeeper v1 Policy + Contracts — Architecture Evidence

This draft package carries the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`.

## Schema And Constraints

- Protobuf data shapes live in [`architecture/`](./architecture).
- CUE constraints bound every protobuf type in that schema.
- A PACT contract under [`architecture/pacts/`](./architecture/pacts) records the
  package's boundary.

## Parse, Don't Validate

Deploy verification parses fixtures and policy IR once at the boundary. Downstream
gate composition receives parsed compatibility decisions, policy decisions, and
obligation replays — not raw DTOs with repeated boolean checks.

## Event Architecture

Deploy-point verification appends:

- `compat.GatePassed` / `compat.GateFailed` — contract compatibility gate
- `policy.Decided` — policy engine audit event
- `policy.ObligationCreated` — durable obligation from policy effect
- `gatekeeper.GatePassed` / `gatekeeper.GateFailed` — per-gate composite results
- `gatekeeper.VerifyPassed` / `gatekeeper.VerifyFailed` — composite verify decision
- `gatekeeper.DeployVerified` — deploy-path rollup for replay

Replay consumers fold these events to answer "why did this deploy block?" without
re-running engines.
