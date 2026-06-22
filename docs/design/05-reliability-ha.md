# Plan 5 — Reliability / HA algorithms

> Part of the [HoBo Design Plan Suite](./README.md). This was an explicit iteration target; below is the concrete design, not a sketch.

> **v3 (Humanitec):** **Pipelines** + approval gates ([Plan 28](./28-agent-gitops-pipelines.md)) run atop the same gated-saga + canary/rollback machinery here. **Incremental deploys** (reconcile only changed nodes via Deltas→Sets, [Plan 26](./26-environments-deltas.md)) shrink blast radius and rollout time.

> **v2 update.** AI **live-fix** ([Plan 23](./23-stubbable-ai-implementations.md)) applies through the same gated deployment-saga + canary/auto-rollback machinery here; a failing trace becomes a permanent regression test. Wasm components' fast restart improves recovery time vs containers.

## Failure taxonomy (what we design against)
| Class | Example | Strategy |
|---|---|---|
| **Transient** | provider 429/503, network blip | retry with capped exponential backoff + jitter, within a budget |
| **Durable-but-recoverable** | Yard node crash mid-deploy | event-log replay → resume exactly where it left off |
| **Partial failure** | resource 3 of 5 failed | saga compensation (rollback already-created resources) |
| **Poison** | malformed plan, fatal provider error | mark `Failed(fatal)`, stop retrying, surface to human/agent |
| **Drift** | someone changed infra out-of-band | periodic resync detects + reconciles (auto or proposed) |
| **Split-brain** | two Yard leaders | leases + fencing tokens; quorum writes reject stale leader |

## Exactly-once *effects* over at-least-once delivery
HoBo never assumes the queue delivers once. Instead:
1. Every command/step carries an **idempotency key** (`meta.idempotencyKey`).
2. The EventStore append is **conditional on expected `seq`** (optimistic concurrency) and **dedups on idempotency key** — a replayed message that already produced its effect appends nothing.
3. External side effects (provider API calls) pass the idempotency key through to the provider where supported (e.g. AWS client tokens, Stripe idempotency keys); where unsupported, the ResourceActor checks observed state (`refresh()`) before acting.

Result: at-least-once queue + conditional append + step memoization ⇒ effects happen exactly once even across retries and replays. (Same guarantee Vercel Workflows gives for steps, extended to infra operations.)

## Saga compensation algorithm
For a deployment DAG `G`:
1. Track the set `P` of resources that reached `Provisioned`, in topological order.
2. On a failure that crosses the deployment's **no-go threshold** (configurable: e.g. any fatal, or N transient exhaustions), emit `deployment.RolledBack`.
3. Each resource in `P` runs its compensation (`IacProvider.destroy` of just its slice) in **reverse topological order**, driven by choreography (each waits for its dependents to compensate first).
4. Compensations are themselves idempotent + retryable; a compensation that fails escalates to `needs-human` rather than looping forever.
5. The original failure + every compensation is in the event log → the dashboard shows exactly what was rolled back and why.

Partial-success deployments are allowed when the Bindle marks resources `optional` — those failures don't trigger rollback of required resources.

## Actor availability: single-writer leases + fencing
Each grain key (ResourceActor, app actors) has at most one active instance:
- **Lease:** activating an actor acquires a lease in the Camp's runtime ActorHost (`key → ownerNode, leaseId, expiry`). Renewed via heartbeat.
- **Fencing token:** the lease carries a monotonically increasing `fenceToken`; every event append by the actor includes it. The EventStore rejects appends with a `fenceToken` lower than the latest seen → a partitioned old owner cannot corrupt state even if it thinks it still holds the lease.
- **Failover:** lease expiry (missed heartbeats) lets another node acquire the key with a higher `fenceToken`; it replays the stream (from the latest snapshot) to rebuild state and resume. **Recovery time ≈ lease TTL + replay-of-tail.**
- **Placement:** consistent-hashing of keys across nodes with bounded load; rebalanced on membership change.

## Control-plane HA
- **Event store replication:** the source of truth is replicated (synchronous quorum for the control-plane streams). Adapter-specific: `runtime-postgres` → synchronous replicas; built-in engine → Raft log.
- **Cross-Camp app-state replication** reuses this same backbone with **declared topologies** ([ADR-0040](./adr/ADR-0040-cross-camp-stateful-consistency.md)): single-writer-Camp (owner writes; other Camps consume a replicated read-stream into bounded-staleness projections), active-active-eventual (CRDT), or pinned — surfaced via the **labeled bounded-staleness reads** below.
- **Leader election** only for *singletons* (e.g. the drift scheduler, membership coordinator) via the same lease mechanism or an external Raft (the built-in engine ships a small Raft; `runtime-*` adapters can delegate to the backing store's primitives).
- **Stateless tier** (Gateway, Planner, Executors) scales horizontally behind a load balancer; any node can serve because all state is in the log/projections.
- **Split-brain safety:** all writes are quorum + fenced, so a minority partition cannot commit. Reads from a stale projection are bounded-staleness and labeled as such in the API.

## Deployment strategies as reusable saga templates
Rollout strategy is a property of a `service`/`web` resource, implemented as a parameterized saga the ResourceActor runs:
- **Recreate** — stop old, start new (dev default).
- **Blue/green** — provision green fully, health-gate, flip the router (provider `gateway` port), keep blue for fast rollback, reap after soak.
- **Canary** — shift `x%` traffic, watch health signals for `t`, auto-advance or auto-rollback on regression. Steps + gates are events → fully auditable/replayable.
- **Progressive** — staged canary (1%→10%→50%→100%) with gates between stages.

Health signals come from the data plane (the Camp's runtime metrics/streams) and/or provider health checks; the gate is a `step` with a timeout and a rollback compensation.

## Provider resilience controls
- **Circuit breaker per (provider, region, operation):** open after a failure-rate threshold; half-open probes; protects against hammering a degraded provider. *(The same breaker pattern is reused as a **spend** circuit-breaker — opened on runaway cost velocity to halt spend-incurring actions, [Plan 16](./16-cost-finops.md)/[ADR-0039](./adr/ADR-0039-billing-quota-cost-attribution.md).)*
- **Retry budgets** (not just per-call retries): a token-bucket cap on total retries per deployment so a flapping provider can't cause unbounded work.
- **Bulkheads / concurrency caps** per tenant and per provider on the Executor pool (backpressure; one tenant's storm can't starve others).
- **Timeouts** at every external boundary, with the operation classified retryable/fatal on expiry.

## Drift detection & self-healing
- **Periodic resync:** the drift scheduler (a leader-elected singleton) enqueues a `refresh()` for each live resource on an interval (with jitter). Divergence emits `resource.DriftDetected` → DriftView projection.
- **Policy per resource:** `heal` (auto-reconcile back to desired), `propose` (open a diff for human/agent approval), or `ignore` (annotated exceptions).
- Event-driven drift (provider change webhooks, where available) supplements polling.

## Disaster recovery
- **RPO:** bounded by event-store replication lag (≈0 for synchronous quorum; configurable for cheaper async tiers).
- **RTO:** rebuild a fresh Yard from the replicated log — `hobo yard up --restore <log>` replays all streams and rehydrates projections + actors. Because the Yard is event-sourced, **DR is just replay**, exercised continuously by the same code path that powers normal recovery.
- **Backups:** periodic log snapshots to object storage in a second region; audit streams (`token.*`, `resource.*`) retained per compliance policy.

## Targets (to ratify with the user)
| Metric | Initial target |
|---|---|
| Control-plane availability | 99.9% (single region), 99.95% (multi-region) |
| Deploy resume after node loss | < 30s (lease TTL + tail replay) |
| RPO | ~0 (sync quorum) / ≤ 5s (async tier) |
| RTO (full Yard rebuild) | < 15 min from replicated log |

## v2 integration (WASM / IfC / AI)
- **AI live-fix as a gated saga.** A failing trace or SLO/health breach triggers an AI-proposed fix, validated sandboxed + replayed, then applied through the **same canary/blue-green saga + auto-rollback** machinery above; the failing trace is retained as a permanent regression test ([Plan 23](./23-stubbable-ai-implementations.md)). Live-fix adds no new failure class — it reuses *compensation* and *deployment-strategy* mechanics.
- **Faster recovery with wasm.** Components' ms-scale cold start shortens actor failover and rollout/rollback windows vs containers, improving the "deploy resume after node loss" target ([Plan 20](./20-wasm-wasi-runtime.md)). Failover is a property of the Camp's **`component-host`** ([ADR-0031](./adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md)): the **wasm-in-container default** restarts the component like any container (re-placed by the same lease/fencing machinery above), while the **wasmCloud-lattice** adapter can additionally **migrate late-bound links across hosts** without redeploy — a stronger failover that apps opt into per Camp.
- **Exactly-once across links.** At-least-once `link.Called` invocations carry idempotency keys, so cross-WIT-boundary calls inherit the exactly-once-*effects* guarantee already used for steps/IaC ([Plan 11](./11-event-model.md)).

## Iteration hooks
- Consensus: ship our own Raft in the built-in engine vs always delegate to the Camp's runtime store.
- Multi-region topology: active-active log vs active-passive with failover.
- Canary health-signal sources & the auto-rollback decision function.
- Default no-go threshold for rollback vs partial-success semantics.
