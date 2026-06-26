# Streamer Runtime Port Contract

Independent POC for HOBO-23. It pins the runtime-local Layer 1 `Streamer`
boundary before Gateway WebSocket transport, Reactor scheduling, or provider
backends exist.

## Public Surface

- `createRuntimeLocalStreamer({ bufferLimit, runIdPrefix })` creates an
  in-memory runtime-local port.
- `runtime.createRun({ runId })` returns `{ runId, readable, getWritable, done }`.
- `runtime.start(workflow)` returns `{ runId, readable, getWritable, done }`
  while the workflow writes to named streams through `getWritable(stream)`.
- `getWritable<T>()` and `run.readable` publish a generic TypeScript surface so
  stream producers and consumers can agree on chunk payload shape.
- `run.readable` is one async iterable per run. Named stream frames multiplex
  through that iterable in write order with monotonically increasing `seq`.
- `runtime.teardownRun(runId, reason)` closes the run, lets already-buffered
  frames drain, and rejects later writes.

## Acceptance Evidence

- A run writes chunks through `getWritable()` and the consumer reads them back in
  order.
- `start(wf)` returns `{ runId, readable }`, and the readable yields workflow
  output while `done` records workflow completion.
- Multiple named streams share one run readable without reordering frames.
- Slow consumers hit `StreamerBackpressureError` at the bounded buffer limit
  instead of growing unbounded memory.
- Run teardown closes the stream and rejects writes after teardown.
- TypeScript declarations compile a generic producer/consumer fixture for
  `getWritable<T>()` and `run.readable`.
- `runStreamerConformance()` returns machine-readable evidence for the
  runtime-local subset.

## Scope Boundary

This POC deliberately does not implement Gateway/WebSocket transport, Reactor
execution, cross-Camp replicated streams, provider persistence, or message
coalescing.

## Verification

```powershell
npm.cmd --prefix src\draft\streamer-runtime-port-contract test
```
