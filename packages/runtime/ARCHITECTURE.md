# @hobo/runtime — Architecture Evidence

Production runtime package. S1-12 (HOBO-601) promotes the deterministic replay
engine and `replay == live` invariant harness from the HOBO-60 spike into
`src/replay/`, exported as `@hobo/runtime/replay`.

## Schema and constraints

- Protobuf records live in [`data-models/replay/`](./data-models/replay).
- CUE constraints bound `ReplayReport`, `ReplayDivergence`, and `SeqVectorEntry`.
- PACT consumer evidence for the replayer → EventStore read boundary lives under
  [`contracts/`](./contracts).

## Parse, don't validate

`parseReplayReport` and `parseReplayDivergence` in `src/replay/parse.ts` are the
single parse-don't-validate boundaries: untrusted report-shaped input becomes
derived parsed domain types before any replay logic runs. Internal replay
functions accept only those refined types.

## Event architecture

- **Command** — workflow/step/hook/timer execution requests recorded by runtime primitives.
- **Event** — `run.*` events append to the event store before deterministic code observes effect results.
- **Actor** — workflow run actor replays by folding the stream into materialized state.
- **Event store** — append-only `run.*` stream is the source of truth (S1-05 port).
- **Materialized view** — replayed workflow state is a deterministic fold over the stream.
- **Snapshot** — `ReplayReport.state_digest` is a canonical digest over folded state.
- **Read store** — `testRuntime().state()` queries the in-memory read model for local tests.

Divergence is a typed `ReplayDivergenceError`, never log-and-continue.
