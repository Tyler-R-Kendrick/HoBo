# Resilience Semantics Annex POC

Independent POC for HOBO-516. It turns the DX SDK resilience semantics matrix
from `docs/design/dx-sdk-resilience-semantics.md` into executable facts for the
later SDK conformance lane.

## Requirements Source

- `docs/design/dx-sdk-resilience-semantics.md`: HOBO-515 vocabulary and target
  vectors.
- `docs/design/sdk-contracts.md`: SDK public-contract map and resilience
  conformance sequencing.
- `src/draft/idiom-semantics-annex`: existing HOBO-31 semantics lane.
- `src/draft/queue-clock-runtime-port-contract`: deterministic retry timing and
  clock facts.
- `src/draft/runtime-local-execution-limits-contract`: interruption, cleanup,
  and audit-fact shape.
- `src/draft/rollback-failure-compensation-contract`: fail-closed terminal and
  escalation posture.
- `src/draft/runbook-execution-engine-contract`: persisted step facts and replay
  inspection posture.

## What This Proves

- Transient provider/runtime failure may retry only through a deterministic,
  budgeted schedule with persisted attempt facts.
- `policy.Decided{allow:false}` is terminal even when a provider also reports a
  transient failure.
- Typed terminal SDK failures never enter retry scheduling.
- Caller-owned cancellation stops pending retry work and emits cleanup facts.
- Deadline expiry escalates from persisted schedule/deadline state even when no
  fresh command attempt occurs.
- Replay-derived inspection reconstructs terminal state without re-running
  effects or incrementing counters.

## Report Shape

The public runner emits:

- `goldenIrLane`: explicitly not owned here; HOBO-32 owns WIT/manifest lowering.
- `existingSemanticsLane`: references HOBO-31 idiom semantics vectors.
- `resilienceSemanticsLane`: the HOBO-516 retry, denial, terminal, cancellation,
  deadline, cleanup, and replay vectors.
- `unsupportedBehavior`: explicit scope guards for helper claims with no vector.

Stable case names:

- `transient-retry-schedule`
- `denial-never-retries`
- `terminal-never-retries`
- `cancellation-stops-retry`
- `deadline-escalates-from-state`
- `cleanup-after-interruption`
- `replay-no-effect-rerun`

## Adversarial Proof

Deliberately bad fixtures fail with stable codes:

- `resilience.denial_retried`
- `resilience.terminal_retried`
- `resilience.cancellation_retried`
- `resilience.deadline_not_escalated`
- `resilience.cleanup_missing`
- `resilience.replay_reran_effect`

## Scope Boundary

This package does not add Effect, XState, `@statelyai/inspect`, a generic
statechart runtime, production `@hobo/conformance` integration, public SDK
syntax, provider implementation, or runtime scheduler behavior. It is only the
branch-sized executable annex contract that later issues can consume.

## Verification

```powershell
npm.cmd --prefix src\draft\resilience-semantics-annex test
```

## Architecture Evidence

This package ships the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`:

- [`proto/resilience_semantics_annex.proto`](./proto/resilience_semantics_annex.proto) — protobuf data shapes for the spec, fixtures, facts, and case results.
- [`cue/resilience_semantics_annex.cue`](./cue/resilience_semantics_annex.cue) — CUE constraints for every protobuf type.
- [`contracts/pacts/resilience-conformance-lane.pact.json`](./contracts/pacts/resilience-conformance-lane.pact.json) — PACT for the SDK conformance-lane boundary.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — parse-don't-validate and event-architecture evidence.
