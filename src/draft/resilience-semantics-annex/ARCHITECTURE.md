# Resilience Semantics Annex — Architecture Evidence

This package is the HOBO-516 executable conformance annex. It carries the
architecture evidence required by `scripts/check-architecture-guardrails.mjs`
so the annex states, rather than implies, how its fixtures are parsed and how the
resilience facts map onto the platform's event flow.

## Schema And Constraints

- Protobuf data shapes for the spec, fixtures, facts, and case results live in
  [`proto/resilience_semantics_annex.proto`](./proto/resilience_semantics_annex.proto).
- CUE constraints for every protobuf type live in
  [`cue/resilience_semantics_annex.cue`](./cue/resilience_semantics_annex.cue).

## Parse, Don't Validate

`runResilienceCase` in
[`src/resilience-semantics-annex.mjs`](./src/resilience-semantics-annex.mjs)
applies the **parse, don't validate** discipline: each fixture's raw fact list is
parsed once into the derived domain types defined above — a `ResilienceFixture`
with ordered `ResilienceFact` events and a derived `ResilienceCaseResult` — and
downstream conformance reporting consumes those parsed, derived types rather than
re-inspecting the raw fixture. The CUE constraints bound the same derived types
so a malformed fixture is rejected at parse time, not silently passed downstream.

## Event Architecture

The annex is event-shaped: every fixture is an ordered fact (event) log, and the
assertions describe how a resilient workflow must behave over that log.

- **Command** — a caller `AttemptEffect` command drives the workflow whose
  resilience behavior the fixtures certify.
- **Event** — each fact (`effect.Attempted`, `provider.Failed`, `retry.Scheduled`,
  `caller.Cancelled`, `cleanup.Emitted`, `workflow.Terminal`) is a domain event in
  the ordered log.
- **Actor** — the workflow actor owns retry, cancellation, deadline, and cleanup
  decisions and reaches a single terminal state per scenario.
- **Event store** — the ordered fact list is the append-only event store the
  annex replays to evaluate each case.
- **Materialized view / projection** — `runResilienceSemanticsAnnex` folds the
  per-case events into a projection (the suite result) for the conformance lane.
- **Snapshot** — each `ResilienceCaseResult` is the snapshot of a case's terminal
  outcome (passed/failed with code and reason).
- **Read store** — the SDK conformance lane reads those case-result snapshots
  rather than re-deriving them from the raw fact log.

The `replay-no-effect-rerun` case explicitly proves replay re-runs no effects, so
the projection is a pure fold over the event store. No runtime SDK, provider, or
event store is implemented here; the annex only fixes the resilience vocabulary
and facts for the later conformance lane.
