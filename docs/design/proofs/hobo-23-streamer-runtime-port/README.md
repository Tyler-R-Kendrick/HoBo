# HOBO-23 Streamer Runtime Port Proof

This proof backs [PLAN-11](../../data-plane.md#plan-11), [PLAN-20](../../wasm-runtime-wit.md#plan-20),
[PLAN-32](../../data-plane.md#plan-32),
[ADR-0002](../../adr/01-architecture-core.md#adr-0002),
[ADR-0003](../../adr/01-architecture-core.md#adr-0003),
[ADR-0040](../../adr/01-architecture-core.md#adr-0040), and
[ADR-0050](../../adr/03-data-plane.md#adr-0050).

The executable POC in
[`src/draft/streamer-runtime-port-contract`](../../../../src/draft/streamer-runtime-port-contract)
pins the HOBO-23 runtime-local Streamer boundary:

- `getWritable(stream).write(chunk)` appends per-run frames that a consumer reads
  from `run.readable` in order;
- `getWritable<T>()` and `run.readable` expose a generic TypeScript declaration
  surface proved by a compile-only consumer fixture;
- `start(wf)` returns `{ runId, readable, done }` and streams workflow output as
  the workflow writes it;
- multiple named streams multiplex through one run readable while preserving
  global write order;
- slow consumers trip bounded backpressure instead of unbounded buffering;
- run teardown closes the stream after buffered frames drain and rejects writes
  after closure;
- `runStreamerConformance()` reports the runtime-local subset as machine-readable
  conformance evidence.

Scope kept out: Gateway/WebSocket transport, Reactor execution, cross-Camp
replicated streams, provider persistence, and message coalescing.

## Verification

```powershell
npm.cmd --prefix src\draft\streamer-runtime-port-contract test
```
