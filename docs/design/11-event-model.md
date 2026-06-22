# Plan 11 — Event model, event sourcing & replay

> Part of the [HoBo Design Plan Suite](./README.md). Everything in HoBo — deployments, workflows, actor state, token issuance — is sourced from this model.

> **v2 update.** Two event families join the catalog: **resource-collection** (`bindle.ResourcesCollected`, `bindle.ManifestProduced` — the IfC step, [Plan 21](./21-resources-catalog.md)/[Plan 22](./22-wiring-manifest.md)) and **cross-WIT-boundary calls** (`link.Called` / stub recordings — the trace stream that powers AI implement/evolve/live-fix, [Plan 23](./23-stubbable-ai-implementations.md)). Both ride the same envelope and replay rules below.

## Why event sourcing is the foundation (not an add-on)
HoBo makes one big bet: **the append-only event log is the single source of truth** for both the control plane (the Yard) and the data-plane runtime (the Camp's runtime). This buys four properties we'd otherwise have to build piecemeal:
- **Recovery** — crash mid-deploy or mid-workflow → replay the stream to rebuild exact state.
- **Audit** — every infra change and every credential issuance is an immutable, ordered fact (directly answers "what did the agent do, and with what token?").
- **Time-travel** — reconstruct state as-of any point; diff two points.
- **Determinism** — durable workflows replay over cached step results (the Vercel model).

The cost is discipline (CQRS, projections, versioning) and that read-after-write needs projections. We accept this; the audit/replay story is a primary differentiator vs Lakebed.

## The event envelope
A single envelope shape across control plane and data plane:
```ts
export interface EventEnvelope<T = unknown> {
  id: string;            // globally unique (ULID — sortable by time)
  type: string;          // "deployment.Provisioned", "run.StepCompleted", ...
  v: number;             // schema version of `type` (for upcasting)
  streamId: string;      // aggregate/run/actor key, e.g. "deployment:01H..."
  seq: number;           // per-stream monotonic sequence (optimistic concurrency)
  ts: string;            // ISO8601, set by the Camp's runtime Clock (deterministic on replay)
  actor: PrincipalRef;   // who/what caused it (user, agent SVID, system)
  tenant: string;        // isolation boundary (Plan 12)
  causationId?: string;  // the command/event that directly caused this
  correlationId?: string;// the saga / deploy / run this belongs to
  data: T;               // typed payload
  meta?: Record<string, unknown>; // tracing (traceparent), idempotency keys
}
```
- **Ordering:** total order within a stream by `seq`; global causal order via `id` (ULID) + `causationId`/`correlationId`.
- **Concurrency:** appends are conditional on expected `seq` (optimistic locking) → no lost updates.
- **Idempotency:** producers attach an idempotency key in `meta`; the store dedups, giving exactly-once *effects* over an at-least-once queue.

## Event catalog (initial, by aggregate)
Naming: `aggregate.PastTenseFact`. Commands (imperative) are *not* stored; only the facts they produce are.

**Bindle / Camp**
`bindle.Registered` · `bindle.VersionPublished` · `camp.Created` · `camp.RuntimeBound` · `env.PromoteRequested` · `env.Promoted` · `env.PromoteRolledBack` (multi-Camp environment-group saga, [ADR-0028](./adr/ADR-0028-multi-camp-deployment-model.md))

**Deployment** (the control-plane saga)
`deployment.Requested` · `deployment.Planned` · `deployment.PlanRejected` · `deployment.Deployed` · `deployment.RolledBack`

**Resource** (one stream per resource instance)
`resource.Provisioning` · `resource.Provisioned` · `resource.UpdateRequested` · `resource.Updated` · `resource.Failed` · `resource.Compensating` · `resource.Destroyed` · `resource.DriftDetected`

**Execution** (IaC/build runs)
`exec.Started` · `exec.Output` · `exec.Succeeded` · `exec.Failed`

**Identity / auth** (the audit trail)
`identity.Issued` · `identity.Rotated` · `token.Granted` · `token.Used` · `token.Revoked` · `token.Denied`

**Registry**
`provider.Registered` · `provider.HoboCodeUpdated` · `provider.Deprecated` · `forge.PluginCertified`

**Runtime (data-plane, per Run)** — mirrors Vercel's durable model
`run.Started` · `run.StepScheduled` · `run.StepCompleted` · `run.StepFailed` · `run.SleepScheduled` · `run.HookCreated` · `run.HookResumed` · `run.Suspended` · `run.Completed` · `run.Failed`

**Actors / sagas**
`actor.Activated` · `actor.StateAppended` · `actor.Passivated` · `saga.Started` · `saga.StepEmitted` · `saga.Compensated` · `saga.Completed`

**IfC collection** (the resource-collection step, [Plan 21](./21-resources-catalog.md)/[Plan 22](./22-wiring-manifest.md))
`bindle.ResourcesCollected` · `bindle.ManifestProduced`

**Links & WIT-boundary calls** (the trace stream powering AI implement/evolve/live-fix, [Plan 20](./20-wasm-wasi-runtime.md)/[Plan 23](./23-stubbable-ai-implementations.md))
`link.Established` · `link.Called` · `stub.Recorded` · `impl.Generated` · `impl.Certified` · `impl.Promoted` · `livefix.Proposed` · `livefix.Applied` · `livefix.RolledBack`

**Platform config & matching** (Resource Definitions, [Plan 25](./25-resource-definitions-matching.md))
`resourcedef.Registered` · `resourcedef.Updated` · `pack.Imported` · **`match.Decided`** (winning definition + score + rejected candidates → "why this infra")

**Environments, deltas & sets** ([Plan 26](./26-environments-deltas.md))
`env.Created` · `env.Cloned` · `env.Reaped` (ephemeral TTL) · `delta.Opened` · `delta.Updated` · `delta.Applied` · `set.Created` · `deployment.Promoted`

**Pipelines** ([Plan 28](./28-agent-gitops-pipelines.md))
`pipeline.Triggered` · `pipeline.StepStarted` · `pipeline.StepCompleted` · `pipeline.GateRequested` · `pipeline.GateApproved` · `pipeline.GateRejected` · `pipeline.Completed`

**Contracts & compatibility** ([Plan 29](./29-contracts-compatibility.md))
`contract.Inferred` · `contract.Observed` · `contract.Promoted` · `contract.Verified` · `contract.VerificationFailed` · **`compat.GatePassed`** · **`compat.GateFailed`**

**Policy** ([Plan 30](./30-policy-plane.md))
**`policy.Decided`** (effect + evidence + obligations) · `policy.ViolationDetected` · `policy.WaiverRequested` · `policy.WaiverApproved` · `policy.ObligationCreated` · `policy.ObligationSatisfied`

**Evals & promotion** ([Plan 23](./23-stubbable-ai-implementations.md))
`eval.Ran` · `eval.GatePassed` · `eval.GateFailed` · `impl.Shadowed` · `impl.Promoted`

**Reactive / live queries** ([Plan 32](./32-reactive-live-queries.md))
`query.Subscribed` · `query.Recomputed` (new `seq` + read-set hash) · `query.Pushed` · `query.Unsubscribed` · **`data.Changed`** (normalized provider change-feed event)

**Forge generation** ([Plan 33](./33-forge-generation-pipeline.md))
`forge.Requested` · `forge.CandidateGenerated` · `forge.Validated` · `forge.ValidationFailed` · `forge.Repaired` (iteration n + failing-assertion set) · `forge.NeedsHuman` · `forge.Certified` (extends the Registry's `forge.PluginCertified` + `impl.*`)

**Training** (`"use training"` semantic-function optimization, [Plan 23](./23-stubbable-ai-implementations.md))
`training.RunStarted` · `training.TrajectoryCaptured` (OTel/OpenInference span tree + I/O) · `training.RewardObserved` (live-eval signal) · `training.CandidateProposed` (rewritten prompt/code) · `training.CandidateEvaluated` · `training.Promoted` · `training.Rejected`

## Projections (read models)
Events are the write model; queries read **projections** rebuilt by folding the stream. Initial projections:
- **DeploymentView** — current status + per-resource state for the dashboard timeline.
- **TopologyView** — Bindle resources → resolved providers + options (the topology graph).
- **RunView** — workflow/step/actor/saga trace for the run inspector.
- **CredentialAudit** — every `token.*` event, joined to the run/agent that triggered it.
- **DriftView** — resources whose observed state diverged from desired.

Projections are rebuildable from zero at any time (this is the test that the log is truly authoritative).

## Snapshots & compaction
- **Snapshots:** for long-lived streams (actors, the Yard's own state), periodically persist a fold result + the `seq` it covers, so activation replays only the tail. Snapshots are a cache, never a source of truth.
- **Compaction:** runtime `run.*` streams can be archived to cold storage after terminal state + retention window; audit (`token.*`, `resource.*`) streams are retained per compliance policy and never compacted away.

## Schema evolution (versioning events)
- Each `type` carries `v`. Readers run **upcasters**: pure functions `vN → vN+1` chained to the current version, so old events remain replayable forever.
- Additive changes (new optional fields) don't bump `v`. Renames/semantic changes do, with an upcaster.
- Never rewrite history; only add upcasters. This keeps replay/audit guarantees intact across years of schema drift.

## How replay powers durable workflows
A workflow run is a stream of `run.*` events. On resume, the runtime replays the workflow function: each `step()` call checks the stream for a matching `StepCompleted` and returns the cached result if present, otherwise schedules the step (`StepScheduled`), suspends, and resumes when the step worker appends `StepCompleted`. Determinism is enforced by seeding `Math.random`/`crypto` and freezing `Date`/`env` from the run's seed events — identical to the Vercel model, but the `EventStore` is whichever runtime backend the Camp provides. See [Plan 2 §Layer 4](./02-sdk-api.md).

## Iteration hooks
- ULID vs UUIDv7 vs hybrid for `id`.
- Single global log vs per-tenant logs vs per-stream logs (sharding) — interacts with [Plan 12](./12-security-multitenancy.md).
- Exactly which streams are compliance-retained vs compactable.
- Whether projections are push (subscription) or pull (on-read fold with cache).
