# Deterministic Replay Engine (HOBO-601 draft POC)

Independent draft POC for **S1-12 / HOBO-601**. Promotes the HOBO-60 equivalence spike and wires a typed replay engine surface ahead of `@hobo/runtime/replay` production promotion.

## Surface

- `createDeterministicContext` — seeded clock/random for deterministic zones (ADR-0086 §3).
- `assertReplayEqualsLive`, `seqVector`, `hashReadSet`, `interleaveStreams`, `stableValue`/`stableStringify` — fold equivalence harness from HOBO-60.
- `ReplayDivergenceError` + `parseReplayReport`/`parseReplayDivergence` — typed divergence and parse boundaries.
- `recordEffect`, `replayRun`, `createInMemoryEventStore` — effect recorder + replayer over an EventStore reader port.
- `testRuntime` + `defineWorkflow` — local replay==live invariant fixtures (checkout workflow, ambient-clock failure, memoized-step control).

## Promotion target

Production promotion path: `packages/runtime/src/replay/` exporting `@hobo/runtime/replay` (blocked on S1-07 + S1-11 merge).

## Verification

```bash
pnpm --prefix src/draft/technical-proofs/deterministic-replay-engine test
```

## Architecture evidence

- `architecture/replay_report.proto` + `replay_report.cue`
- `architecture/pacts/replayer_eventstore.pact.json`
- `ADR.md`

## Related proofs

- `src/draft/technical-proofs/replay-live-equivalence-poc/` — HOBO-60 spike (equivalence semantics source)
- `src/draft/technical-proofs/local-dev-test-authoring-contract/` — `testRuntime()` replay fixture patterns
