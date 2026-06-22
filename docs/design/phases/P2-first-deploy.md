# Build stage 2 — First real deploy

> [Phases index](./README.md) · realizes [Plan 3](../03-providers-iac.md), [Plan 4](../04-control-plane.md), [Plan 10](../10-architecture-overview.md), [Plan 11](../11-event-model.md).

**Objective.** Take a collected manifest and **deploy it to one real cloud** through a minimal Yard, with the event-sourced deployment lifecycle and crash-resume.
**Depends on.** Stage 1.

> **Resource Definitions + Matching:** the Planner resolves each resource via **Resource Definitions + Matching** ([Plan 25](../25-resource-definitions-matching.md)) — `hobo.config.ts` compiles to default definitions, and `match.Decided` is recorded; the IaC apply is the **`terraform` Driver** ([Plan 27](../27-drivers-packs-profiles.md)); the deployment runs as **Delta → Set** with incremental reconcile ([Plan 26](../26-environments-deltas.md)).

> **Contracts & policy (the Gatekeeper):** introduce the **Gatekeeper** at Delta→Set — the built-in `contract-engine` (declared/inferred contracts + `can-deploy`, [Plan 29](../29-contracts-compatibility.md)) and `policy-engine` (typed-TS packs + obligations, [Plan 30](../30-policy-plane.md)); `hobo verify` blocks an unsafe first deploy with an explainable, event-sourced reason.

## Workstream 1 — IaC adapter (`@hobo/iac-pulumi`)
1. Wrap the **Pulumi Automation API** (no CLI): `preview`/`apply`/`destroy`/`refresh` against an `IacProgram`.
2. Per-resource stack model + state backend + outputs capture ([Plan 3](../03-providers-iac.md)).

## Workstream 2 — First CloudProvider (Cloudflare *or* Fly — pick the simplest)
1. Implement a few capability ports (`web`/`service` via wasm-host or container target, `kv`, `objectStore`) as a **capability provider** (deploy `realize()` + runtime WIT impl).
2. Equivalence-class mappings + provider-specific `.with(...)` option types.
3. Publish the provider's **Capability Manifest** ([Plan 6](../06-ai-native-agent-auth.md)) and its **link** wiring ([Plan 20](../20-wasm-wasi-runtime.md)).

## Workstream 3 — Production runtime (`@hobo/runtime-postgres`)
1. Implement the five runtime ports on Postgres (graphile-worker-style queue, NOTIFY/LISTEN streams, snapshots); pass runtime-port conformance.

## Workstream 4 — Yard (first cut) (`@hobo/cloud`)
1. **Gateway** (SDK RPC + REST) with authn/z; accept commands → emit events.
2. **Planner**: manifest IR → `DeploymentPlan` DAG (provider resolution, capability negotiation) ([Plan 3](../03-providers-iac.md)).
3. **Orchestrator + ResourceActors**: reconciliation FSM + choreography ([Plan 4](../04-control-plane.md)).
4. **Executors**: Firecracker-sandboxed IaC apply + component build, scoped creds, `exec.*` events.
5. **Event store** = Postgres runtime; deployment lifecycle events (`deployment.*`, `resource.*`).
6. OCI artifact push for built components.

## Workstream 5 — CLI deploy path
1. `hobo plan` (dry-run plan + diff), `hobo deploy` (provision/converge), `hobo destroy`, `hobo inspect deploy`.
2. `hobo login` (dev SVID stub; full broker in stage 3).

## Deliverables
- `iac-pulumi`; one CloudProvider; `runtime-postgres`; Yard (single-node, first cut); deploy path.

## Exit criteria (acceptance)
- `hello-bindle` **deploys to one real cloud** and serves traffic.
- **Kill the Yard mid-deploy** → it resumes from the event log to completion.
- Inject a provisioning failure → **saga compensation** rolls back already-created resources in reverse-dependency order.
- The deployment timeline projection reconstructs the run from events.

## Risks / iteration hooks
- Default first provider (Cloudflare vs Fly vs a local Docker provider).
- Per-resource vs grouped IaC stacks; drift policy ([Plan 3](../03-providers-iac.md)).
- Deployed wasm host target (SpinKube/containerd-wasm vs wasm-in-container vs wasmCloud lattice).
