---
layout: ../../layouts/Docs.astro
title: Architecture
description: "HoBo's reference architecture: the Yard control plane, the data plane, event-sourced components, the Dispatcher behind continuous migration, and the @hobo/* package layout."
---

# Architecture

A condensed tour of the machinery that packs, places, and — crucially — *keeps re-placing* your app.

## The one-paragraph model

A developer (or agent) writes a **Bindle** (app topology) and optionally `camp()`/`yard()`/`junction()` scope objects mapping ports to providers. The **Yard** — HoBo's provider-specific control plane — receives a deploy request; the **Planner** turns Bindle + mapping into a **DeploymentPlan** (a DAG of resource plans); the **Orchestrator** drives each resource to reality through **ResourceActors** that call IaC/build adapters inside sandboxed **Executors**, brokering short-lived credentials from **Identity**. Every state transition is an event in an append-only log, so the whole system is replayable, auditable, and recoverable. The app lands in a **Camp**, which also supplies the durable runtime the app's actors and workflows run on. And then the **Dispatcher** keeps watching: when a cheaper valid home appears, the same pipeline runs again as a migration.

## Control plane vs data plane

Keeping these separate is a core architectural commitment:

- **Control plane (the Yard)** decides *what infrastructure should exist* and makes it exist. Event-sourced, actor-based, multi-tenant — and **never on the critical path** of a running app's request. If the Yard is down, deployed apps keep serving. (They just can't move that day.)
- **Data plane (the running Bindle)** is your actual app plus the Camp's durable runtime (event store, queues, streams, actors, clock). It uses HoBo's runtime SDK primitives but does not depend on the Yard at request time.

## Control-plane components

| Component | Responsibility | Emits |
|---|---|---|
| **Gateway** | Authn/z; SDK RPC + REST + MCP; accept commands; serve read models | `DeployRequested`, … |
| **Identity** | Workload identities (SVIDs); OIDC; broker provider tokens | `IdentityIssued`, `TokenGranted` |
| **Registry** | Catalog of providers + their Capability Manifests | `ProviderRegistered` |
| **Planner** | Resolve mappings → `DeploymentPlan` DAG; capability/region/cost constraints | `Planned`, `PlanRejected` |
| **Dispatcher** | Continuous placement: watch cost/policy/reliability signals; propose policy-gated migrations to better homes | `MigrationPlanned`, … |
| **Orchestrator** | One ResourceActor per resource reconciling desired↔actual; sagas for ordering & compensation | `Provisioning`, `Provisioned`, `Failed`, `Deployed` |
| **Executors** | Run IaC apply/preview/destroy + builds in sandboxes with scoped, short-lived credentials | `ExecStarted`, `ExecSucceeded`, `ExecFailed` |
| **Event Store** | Append-only source of truth; subscriptions; snapshots | *(is the log)* |
| **Read models** | Materialized projections for queries and dashboards | *(query API)* |

Two runtime/IfC additions: the **wasm host** (runs components; holds the link table binding each import to a capability provider) and the **Collector** (runs components in resource-collection mode to produce the manifest IR the Planner consumes).

## The deploy path (and the migration path — same path)

```text
hobo up
  → Gateway authenticates the principal   → DeployRequested
  → Planner solves the plan               → Planned
  → Orchestrator spawns ResourceActors    → Provisioning … Provisioned
  → (failure? sagas compensate)           → Failed → Compensating
  → DAG completes                         → Deployed

…and later, unprompted:
  Dispatcher spots a cheaper valid camp   → MigrationPlanned
  → policy gate approves (or a human does)
  → the exact same convergence loop       → Migrated
```

A crash anywhere is recovered by replaying the deployment's event stream. Inspection (`hobo inspect run <id>`) reads projections and never touches providers. There is deliberately no separate "migration engine" to trust — if you trust `hobo up`, you already trust a move.

## Key invariants

1. **Commands mutate only via events.** No component writes resource state except by appending an event.
2. **Executors are the only thing that touches a cloud** — always sandboxed, always with a short-lived scoped token.
3. **The Yard is itself a Bindle**, deployed by an earlier Yard or bootstrapped locally (self-host = hosted).
4. **Same code, many Camps.** Swapping a Camp's runtime backend changes durability backing, never app logic — that's what keeps moves cheap.
5. **Deny-by-default linking.** A deployed component reaches a backend only via a link the manifest declared.

## Package layout

The `@hobo/*` packages are layered; dependencies point inward only (`apps → adapters → sdk/runtime → core`), keeping adapters swappable and the agnostic core clean:

| Layer | Packages |
|---|---|
| Authoring | `@hobo/bindles` (IfC resources + `.allow()`), `@hobo/camps`, `@hobo/yards`, `@hobo/junctions` |
| Contracts | `@hobo/core` (ports, event envelope), `@hobo/wit` (WIT interfaces + bindings), `@hobo/conformance`, `@hobo/contracts`, `@hobo/policy` |
| Runtime | `@hobo/runtime` (actors, workflow/step, agents), `@hobo/data`, `@hobo/events`, `runtimes/*` (local, postgres, temporal, restate, cloudflare) |
| Adapters | `providers/*` (aws, azure, gcp, cloudflare, fly, kubernetes), `iac/*` (pulumi primary; cdktf, crossplane, opentofu), `build/*` (wasm, dagger, packer) |
| Surfaces | `@hobo/cli`, `@hobo/sdk` (operator SDK), `@hobo/mcp`, `@hobo/registry`, `@hobo/identity`, `@hobo/componentize` |

Structural rules are enforced mechanically: every package pairs `src/`, `test/`, `contracts/`, and `data-models/`, and architecture guards keep the layering honest.
