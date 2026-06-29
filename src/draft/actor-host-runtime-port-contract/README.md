# ActorHost Runtime Port Contract POC

Independent POC for HOBO-21. It pins the `ActorHost` runtime-port behavior from
`docs/design/sdk-api.md#plan-02`, `docs/design/data-plane.md#plan-11`,
ADR-0002, and ADR-0053.

## Contract Surface

- `createInMemoryActorHost({ clock, leaseTtlMs })` exposes `acquire(key)` and `state(key)`.
- `acquire(key, { holderId })` returns a lease with a monotonic `fenceToken`,
  `expiresAt`, `renew()`, and `release()`.
- Lease append authority is tied to the immutable, opaque lease object identity,
  not to copied or mutated public lease fields.
- Only one non-expired lease can exist for an actor key.
- `state(key, { initialState, fold })` returns durable actor state backed by the
  actor stream.
- `append(lease, event)` rejects stale, released, expired, or key-mismatched
  leases before mutating the stream.
- `passivate(lease)` snapshots the folded state and releases the activation lease.
- Later activations rebuild from the latest snapshot plus the event-log tail.

## Scope Boundaries

Included:

- Single-writer lease acquisition.
- Monotonic fence tokens.
- Lease renewal and expiry.
- Stale-fence and expired-zombie write rejection.
- Durable actor-state fold over the actor stream.
- Snapshot-on-passivation and tail replay on activation.

Excluded:

- Cross-Camp ownership/failover from ADR-0040.
- CQRS command aggregate ergonomics from the Data Plane idiom layer.
- Reactor, projection fan-out, queues, and provider-backed persistence.
- Full HOBO-20 EventStore runtime port semantics; this POC uses a local in-memory
  stream only to prove the ActorHost boundary.

## Verification

```powershell
npm.cmd --prefix src\draft\actor-host-runtime-port-contract test
npm.cmd test
```


## Architecture Evidence

This package ships the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`:

- `architecture/` — protobuf data shapes and CUE constraints for Actor Host Runtime Port Contract.
- `architecture/pacts/` — PACT contract for the package boundary.
- `ARCHITECTURE.md` — parse-don't-validate and event-architecture evidence.
