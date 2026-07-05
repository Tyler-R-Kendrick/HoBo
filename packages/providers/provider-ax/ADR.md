# @hobo/provider-ax — Architecture Evidence

The built-in `hobo:training-engine` implementation (ADR-0025 "built-in-opto"),
built on [ax (`@ax-llm/ax`)](https://github.com/ax-llm/ax) per
[ADR-0125](../../../docs/design/adr/03-data-plane.md#adr-0125): typed
signatures + GEPA/bootstrap `optimize()` + serialized-optimized-program
training artifacts. Engine-internal: selected behind the WIT port per
tenant/Camp, never part of the SDK surface; swapping engines is
configuration.

## Schema and constraints

- Protobuf records live in
  [`data-models/training_artifact_program.proto`](./data-models/training_artifact_program.proto)
  (the platform-normalized artifact program this engine emits); the port's
  trajectory/candidate records are owned by `@hobo/core`
  (`data-models/training_trajectory.proto`, `training_candidate.proto`).
- CUE constraints bound every protobuf type in
  [`data-models/training_artifact_program.cue`](./data-models/training_artifact_program.cue).
- PACT boundary evidence for the optimize edge lives under
  [`contracts/pacts/`](./contracts/pacts/).

## Parse, don't validate

The engine's boundary crosses two parsers and only derived types flow
between them: `optimize()` re-parses even trusted callers with
`parseOptimizeRequest` (deep-frozen parsed `OptimizeRequest`), and re-parses
its own output with `parseTrainingCandidate`, so an engine bug can never
emit an out-of-contract candidate. Trajectory hashes are canonical-JSON
sha256 derived values.

## Event architecture

The engine is a pure function over recorded execution; the training loop
around it is event-sourced (Plan 23 / `event-families.md`):

- **Command** — `RequestOptimization` submits an optimize request for one
  trainable method's generated region.
- **Event** — `training.RunStarted` … `training.CandidateProposed` carry the
  run; the candidate this engine returns rides `training.CandidateProposed`.
- **Actor** — the Yard's training-run actor owns run state and calls this
  engine behind the port; the engine itself holds no state.
- **Event store** — trajectories are read from, and candidates appended to,
  the platform event store (trajectories ride the event log, ADR-0099).
- **Materialized view / projection** — the training-run projection folds
  `training.*` events into run status for the dashboard.
- **Snapshot** — the provenance-pinned training artifact is the snapshot a
  promotion applies at instantiation (ADR-0125 apply-at-load).
- **Read store** — champion/challenger eval comparisons query the training
  read store; promoted artifacts are fetched from the artifact store.
