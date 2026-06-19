# Plan 5 — Reliability / HA algorithms (iteration target)

> Part of the [HoBo Design Plan Suite](./README.md).

Sketch now; this is an explicit iteration target.

- **Exactly-once effects:** at-least-once queue + idempotency keys + event-log memoization (Vercel model).
- **Compensation:** every provisioning step has an inverse; saga rollback on partial failure.
- **Actor availability:** single-writer leases per grain key; failover via World's ActorHost; placement + rebalancing.
- **Control-plane HA:** event-store replication; leader election for singletons (Raft via World adapter or external); quorum writes.
- **Deployment strategies as saga templates:** blue/green, canary, progressive rollout, with automated rollback on health-signal regression.
- **Resilience to providers:** per-provider circuit breakers, retry budgets, backpressure; drift detection + self-healing reconcile loop.
- **DR:** replay the event log into a fresh Yard to rebuild full state.

## Iteration hooks
- Consensus choice.
- RPO/RTO targets.
- Multi-region topology.
- Health-signal sources for canary gates.
