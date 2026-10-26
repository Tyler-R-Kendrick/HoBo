# Hosted original-job relay

The implementation is an application-layer consumer of `@hobo/ci`. It does not
replace HoBo's Dispatcher or reuse `workflow_dispatch` adapters as if they could
rewrite a queued GitHub job. An outer companion workflow hosts an ephemeral JIT
runner that can execute an original job with `runs-on: hobo`.

Commands: queue an observed GitHub job, reserve an eligible host, dispatch a host,
claim one runner registration, observe actual assignment, reconcile a stopped host.
Events: `ci.JobQueued`, `ci.JobCompleted`, `ci.LeaseReserved`, `ci.DispatchRequested`,
`ci.HostDispatched`, `ci.RunnerClaimed`, `ci.RunnerRegistered`, `ci.JobObserved`,
`ci.LeaseUncertain`, `ci.LeaseCancelled`, `ci.HostSettled`.

`LeaseStore` is a single-writer SQLite actor partition. It appends generated
`CiEvent` records and updates the lease/pending-job query projections in the same
transaction; no network operation runs in the transaction. Durable reserved leases
form the outbox. Intent is persisted before dispatch/JIT creation. An ambiguous
result remains held and is never automatically retried. Replay reconstructs leases,
pending jobs and terminal tombstones. SQLite is the adapter, not the SDK contract.
A shared storage-journal/Broker event-envelope adapter remains a tracked platform
integration task; this package owns its initial narrow journal schema.

All persisted contracts are generated from `../ci/data-models/ci.proto`. Zod parses
external GitHub REST/webhook subsets and OIDC claims once at the I/O boundary. CUE
constraints live with shared protobufs; schema-tools exercises valid/invalid
entitlement fixtures. PACT inventory identifies simulated consumer/provider edges.
App credentials and JIT tokens never enter the journal or dispatch inputs.

Actor identity and exact host labels defend against manual workflow dispatch using
another lease's title. Protected ref dispatch plus SHA verification establishes
reviewed workflow content. Repository-wide trusted execution is still mandatory:
GitHub cannot bind a JIT runner to one job ID, and nested processes share a machine.
No live provider, production isolation, invoice accuracy or multi-region durability
claim follows from these tests. See README trust limits and implementation backlog.

Parse, don't validate: Zod and protobuf constructors establish parsed domain types
at external boundaries. The local JIT response type is generated from this package's
`data-models/jit_bootstrap_response.proto`; shared durable records remain owned by
`@hobo/ci`. The event store, materialized projection, snapshot and read store all
reside in one transactional partition, and query views can be replayed from events.

GitHub label matching creates pool demand, not a permanent job-to-host identity.
Multiple historical leases for one job are valid. At most one active planned lease
is deduplicated in the writer transaction; a verified queued original job is
requeued atomically with host settlement. This prevents reordered webhook delivery
or runner assignment from stranding work. Replay preserves this re-admission.
