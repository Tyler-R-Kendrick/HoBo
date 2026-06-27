# wRPC Membrane Failure Contract POC

Independent POC for HOBO-25. It pins the membrane behavior that was explicitly out of scope for HOBO-18: bounded backpressure, partial/ambiguous failure signals, and the reconciliation rule that separates HoBo-owned EventStore effects from provider RPC effects.

## Contract Surface

- `createMembraneFailureContract()` registers WIT-provider exports with a bounded `maxInFlight` counter.
- `MembraneOverloadedError` maps saturated providers to `membrane: "overloaded"` and the system `transient` strategy.
- `MembraneSeveredError` and `AmbiguousReturnError` map mid-stream severance / ambiguous return to `partial-failure` with `forward-key-or-refresh-before-act`.
- `reconcileAmbiguousFailure(...)`:
  - dedups EventStore append effects through `meta.idempotencyKey`;
  - retries provider RPC at least once while forwarding the idempotency key;
  - suppresses retry storms while the provider remains overloaded.
- `runMembraneFailureConformance()` emits the HOBO-25 component-host conformance assertions.

## Scope Boundaries

This POC does not implement NATS/JetStream, per-provider idempotency mechanisms, or Reactor client coalescing. It proves the contract a real membrane/host adapter must satisfy.

## Verification

```powershell
npm.cmd --prefix src\draft\wrpc-membrane-failure-contract test
npm.cmd test
```
