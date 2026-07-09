# @hobo/provider-agent-lightning — Architecture Evidence

The Microsoft [Agent Lightning](https://microsoft.github.io/agent-lightning/stable/)
adapter for the `hobo:training-engine` port (ADR-0025 optional provider,
[generated-stack.md](../../../docs/design/generated-stack.md)). Agent
Lightning is an **out-of-process RL trainer**: it runs the agent as an
environment, collects rollouts, and returns an optimized policy. This package
is the thin, port-conformant boundary that lowers an `OptimizeRequest` to a
rollout submission, delegates training to an injected transport (the RL-server
client), and lifts the returned policy back into a platform
`TrainingArtifact`. Engine-internal: selected behind the WIT port per
tenant/Camp, never part of the SDK surface; swapping to this adapter from the
built-in ax engine is configuration.

## Schema and constraints

- Record shapes are the **generated** proto types: the port records
  (optimize request, candidate, artifact program) come from `@hobo/core`'s
  `data-models/training_engine.proto`; this package's own
  [`data-models/agent_lightning_payload.proto`](./data-models/agent_lightning_payload.proto)
  describes only the engine-internal payload (the rollout id and serialized
  policy) stored in the platform program's `engine_payload_json`. Codegen is
  opted in via `data-models/buf.yaml`; generated types live in
  `src/_generated/`.
- CUE constraints bound every protobuf type in
  [`data-models/agent_lightning_payload.cue`](./data-models/agent_lightning_payload.cue),
  and the fixtures under [`data-models/fixtures/`](./data-models/fixtures/)
  are `cue vet`-ed by the codegen gate.
- PACT boundary evidence for the optimize edge lives under
  [`contracts/pacts/`](./contracts/pacts/).

## Parse, don't validate

The adapter's boundary crosses two parsers and only derived types flow between
them: `optimize()` re-parses even trusted callers with `parseOptimizeRequest`
(deep-frozen parsed generated `OptimizeRequest`), and re-parses its own output
with `parseTrainingCandidate`, so an adapter or transport bug can never emit an
out-of-contract candidate. Trajectory hashes are canonical proto-JSON sha256
derived values (`hashTrajectory`, `@hobo/core`).

## Event architecture

The adapter is a pure function over the request and the injected transport;
the training loop around it is event-sourced (Plan 23 / `event-families.md`):

- **Command** — `RequestOptimization` submits an optimize request for one
  trainable method's generated region.
- **Event** — `training.RunStarted` … `training.CandidateProposed` carry the
  run; the candidate this adapter returns rides `training.CandidateProposed`.
- **Actor** — the Yard's training-run actor owns run state and calls this
  adapter behind the port; the adapter itself holds no state.
- **Event store** — trajectories are read from, and candidates appended to,
  the platform event store (trajectories ride the event log, ADR-0099).
- **Materialized view / projection** — the training-run projection folds
  `training.*` events into run status for the dashboard.
- **Snapshot** — the provenance-pinned training artifact is the snapshot a
  promotion applies at instantiation (ADR-0125 apply-at-load).
- **Read store** — champion/challenger eval comparisons query the training
  read store; promoted policies are fetched from the artifact store.
