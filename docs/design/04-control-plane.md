# Plan 4 — The Yard (hobo-cloud control plane)

> Part of the [HoBo Design Plan Suite](./README.md).

The Yard is the orchestrator that maps bindle deployments to real hosting. It is **itself a HoBo bindle** (dogfood) and runs on the TS-native core; Kubernetes/Crossplane is an optional execution substrate adapter.

## Services (each a grain-based module)
- **Gateway** — SDK RPC + REST + **MCP** ingress; authn/z.
- **Identity** — issues agent/workload identities (SPIFFE-style SVIDs), acts as OIDC provider + token broker ([Plan 6](./06-ai-native-agent-auth.md)).
- **Registry** — Provider + Hobo Code catalog; capability search.
- **Planner** — bindle + mapping → `DeploymentPlan` DAG; capability/region/cost solving.
- **Orchestrator** — **choreography saga engine** over the event store. Each resource is a **ResourceActor** (a controller-style grain) that owns its lifecycle and reconciles desired↔actual via the resolved IaC adapter. Resource actors coordinate by emitting/observing events (e.g. `DatabaseReady` → `ApiDeployable`), not via a central coordinator.
- **Executors** — sandboxed (Firecracker) runners that execute IaC applies + Dagger builds with short-lived scoped creds.
- **Event store** — source of truth; deployments are event-sourced → audit, recovery, time-travel, and **replay-based reconciliation**.

## Deployment lifecycle (event-sourced)
```
DeployRequested → Planned → (per resource) Provisioning → Provisioned
                                          ↘ Failed → Compensating
                          → Deployed
```
A crash mid-deploy resumes by replaying the log; a partial failure triggers saga compensations (destroy/rollback the resources already created).

## Multi-tenancy
Tenant = isolation boundary for event streams, actor placement, and credential scope. Self-host runs single-tenant; hosted runs multi-tenant on the same code.

## Iteration hooks
This whole plan is flagged for a deeper future pass:
- Planner algorithms.
- ResourceActor reconciliation FSM.
- Tenant isolation model.
- How the Yard bootstraps itself.
