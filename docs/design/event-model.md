# Event Model, Sourcing & Replay

This capability doc consolidates Plan 11 of the HoBo design suite.

## Plan 11

**Plan 11 — Event model, event sourcing & replay**

> **Runtime/IfC integration.** Two event families join the catalog: **resource-collection** (`bindle.ResourcesCollected`, `bindle.ManifestProduced` — the IfC step, [Plan 21](./authoring-resources-wiring.md#plan-21)/[Plan 22](./authoring-resources-wiring.md#plan-22)) and **cross-WIT-boundary calls** (`link.Called` / stub recordings — the trace stream that powers AI implement/evolve/live-fix, [Plan 23](./forge-generated-stack.md#plan-23)). Both ride the same envelope and replay rules below.

### Why event sourcing is the foundation (not an add-on)
HoBo makes one big bet: **the append-only event log is the single source of truth** for both the control plane (the Yard) and the data-plane runtime (the Camp's runtime). This buys four properties we'd otherwise have to build piecemeal:
- **Recovery** — crash mid-deploy or mid-workflow → replay the stream to rebuild exact state.
- **Audit** — every infra change and every credential issuance is an immutable, ordered fact (directly answers "what did the agent do, and with what token?").
- **Time-travel** — reconstruct state as-of any point; diff two points.
- **Determinism** — durable workflows replay over cached step results (the Vercel model).

The cost is discipline (CQRS, projections, versioning) and that read-after-write needs projections. We accept this; the audit/replay story is a primary differentiator vs Lakebed.

### The event envelope
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

### Event catalog (initial, by aggregate)
Naming: `aggregate.PastTenseFact`. Commands (imperative) are *not* stored; only the facts they produce are.

**Bindle / Camp**
`bindle.Registered` · `bindle.VersionPublished` · `camp.Created` · `camp.RuntimeBound` · `env.PromoteRequested` · `env.Promoted` · `env.PromoteRolledBack` (multi-Camp environment-group saga, [ADR-0028](./adr/05-config-matching-environments.md#adr-0028))

**Deployment** (the control-plane saga)
`deployment.Requested` · `deployment.Planned` · `deployment.PortabilityReported` (plan-time portability scorecard: portability % + lock-in sources + per-resource equivalence class + upgrade readiness — [Plan 22](./authoring-resources-wiring.md#plan-22)/[ADR-0024](./adr/07-portability-extensibility.md#adr-0024)) · `deployment.PlanRejected` · `deployment.Deployed` · `deployment.RolledBack`

**Resource** (one stream per resource instance)
`resource.Provisioning` · `resource.Provisioned` · `resource.UpdateRequested` · `resource.Updated` · `resource.Failed` · `resource.Compensating` · `resource.Destroyed` · `resource.DriftDetected` · `resource.Adopted` (existing resource brought under management on `hobo import` + its source/provenance, [ADR-0041](./adr/07-portability-extensibility.md#adr-0041))

**Execution** (IaC/build runs)
`exec.Started` · `exec.Output` · `exec.Succeeded` · `exec.Failed`

**Identity / auth** (the audit trail)
`identity.Issued` · `identity.Rotated` · `token.Granted` · `token.Used` · `token.Revoked` · `token.Denied`

**End-user auth** (app users, [Plan 36](./ai-native-agent-auth.md#plan-36)/[ADR-0038](./adr/02-identity-security.md#adr-0038)) — same `actor: PrincipalRef` audit path as agents/services
`user.Authenticated` (verification result + principal claims) · `session.Started` · `session.Refreshed` · `session.Revoked` (revocation / sign-out-everywhere; authz decisions ride `policy.Decided`)

**Registry**
`provider.Registered` · `provider.CapabilityManifestUpdated` · `provider.Deprecated` · `forge.PluginCertified` · `registry.BundleImported` (signed offline bundle imported + verified — air-gap supply chain, [ADR-0036](./adr/07-portability-extensibility.md#adr-0036))

**Runtime (data-plane, per Run)** — mirrors Vercel's durable model
`run.Started` · `run.StepScheduled` · `run.StepCompleted` · `run.StepFailed` · `run.SleepScheduled` · `run.HookCreated` · `run.HookResumed` · `run.Suspended` · `run.Completed` · `run.Failed`

**Actors / sagas**
`actor.Activated` · `actor.StateAppended` · `actor.Passivated` · `saga.Started` · `saga.StepEmitted` · `saga.Compensated` · `saga.Completed`

**IfC collection** (the resource-collection step, [Plan 21](./authoring-resources-wiring.md#plan-21)/[Plan 22](./authoring-resources-wiring.md#plan-22))
`bindle.ResourcesCollected` · `bindle.ManifestProduced`

**Links & WIT-boundary calls** (the trace stream powering AI implement/evolve/live-fix, [Plan 20](./wasm-runtime-wit.md#plan-20)/[Plan 23](./forge-generated-stack.md#plan-23))
`link.Established` · `link.Called` · `stub.Recorded` · `impl.Generated` · `impl.Certified` · `impl.Promoted` · `livefix.Proposed` · `livefix.Applied` · `livefix.RolledBack`

**Platform config & matching** (Resource Definitions, [Plan 25](./platform-engineering.md#plan-25))
`resourcedef.Registered` · `resourcedef.Updated` · `pack.Imported` · **`match.Decided`** (winning definition + full lexicographic ranking [specificity → priority → objective → stable tiebreak] + objective used + tie flag + rejected candidates with reasons → "why this infra", deterministic/replayable — [ADR-0033](./adr/05-config-matching-environments.md#adr-0033))

**Environments, deltas & sets** ([Plan 26](./platform-engineering.md#plan-26))
`env.Created` · `env.Cloned` · `env.Reaped` (ephemeral TTL) · `delta.Opened` · `delta.Updated` · `delta.Applied` · `set.Created` · `deployment.Promoted`

**Pipelines** ([Plan 28](./platform-engineering.md#plan-28))
`pipeline.Triggered` · `pipeline.StepStarted` · `pipeline.StepCompleted` · `pipeline.GateRequested` · `pipeline.GateApproved` · `pipeline.GateRejected` · `pipeline.Completed`

**Contracts & compatibility** ([Plan 29](./contracts-policy-flags.md#plan-29))
`contract.Inferred` · `contract.Observed` · `contract.Promoted` · `contract.Verified` · `contract.VerificationFailed` · **`compat.GatePassed`** · **`compat.GateFailed`**

**Policy** ([Plan 30](./contracts-policy-flags.md#plan-30))
**`policy.Decided`** (effect + evidence + obligations) · `policy.ViolationDetected` · `policy.WaiverRequested` · `policy.WaiverApproved` · `policy.ObligationCreated` · `policy.ObligationSatisfied`

**Cost & metering** ([Plan 16](./reliability-observability-cost.md#plan-16)/[ADR-0039](./adr/04-governance-verification.md#adr-0039)) — metering is the `MeteringView` *projection* (no per-usage events); quota decisions ride `policy.Decided`
`spend.CircuitTripped` · `spend.CircuitReset` (runaway-spend breaker) · `spend.DegradationRequired` · `spend.DegradationApplied` · `spend.DegradationRolledBack` (cost-driven graceful degradation saga, [ADR-0066](./adr/04-governance-verification.md#adr-0039))

**Evals & promotion** ([Plan 23](./forge-generated-stack.md#plan-23))
`eval.Ran` · `eval.GatePassed` · `eval.GateFailed` · `impl.Shadowed` · `impl.Promoted`

**Reactive streams & subscriptions** ([Plan 32](./data-plane.md#plan-32))
`subscription.Opened` · `subscription.Recomputed` (new `seq` + read-set hash) · `subscription.Pushed` · `subscription.Closed` · **`data.Changed`** (normalized sink change-feed event) *(legacy aliases: `query.Subscribed`/`Recomputed`/`Pushed`/`Unsubscribed`)*

**Data plane / projections** ([Plan 39](./data-plane.md#plan-39)) — app domain data is event-sourced (commands→events here); a projection folds streams into an architect-chosen sink
`projection.Declared` (read-model record + event-type read-set + reactivity class) · `projection.Lagged` (staleness/lag exceeded a bound → policy input) · `projection.SinkRebound` (Matching reselected a sink; links `match.Decided`) — sink **schema** changes reuse `migration.*`; sink **change-feeds** reuse `data.Changed`; rebuild-from-zero is a `migration.PhaseApplied` backfill

**Operator Agents (the Crew)** ([Plan 40](./operators-sre.md#plan-40)) — roster-level facts; per-agent runs reuse `run.*`, domain facts ride existing families
`crew.AgentDispatched` (which operator + triggering signal) · `crew.ActionProposed` (action + blast radius + `policy.Decided` ref) · `crew.ActionApplied`/`crew.ActionDenied` (ride `policy.Decided`) · `crew.HandoffRequested` (escalate to another operator or a human)

**Forge generation** ([Plan 33](./forge-generated-stack.md#plan-33))
`forge.Requested` · `forge.CandidateGenerated` · `forge.Validated` · `forge.ValidationFailed` · `forge.Repaired` (iteration n + failing-assertion set) · `forge.NeedsHuman` · `forge.Certified` (extends the Registry's `forge.PluginCertified` + `impl.*`)

**App-data migrations** ([Plan 34](./data-plane.md#plan-34)) — the developer's `sql`-resource schema/data, *not* this log's own upcasting (see Schema evolution below)
`migration.Planned` · `migration.SnapshotTaken` · `migration.PhaseApplied` (phase = `expand`/`backfill`/`contract` + the diff) · `migration.Verified` · `migration.RolledBack` · `migration.Failed` · **(cross-cloud move)** `migration.Exported` · `migration.Imported` · `migration.CutOver`

**Custom domains & ingress** ([Plan 13](./security-networking.md#plan-13)/[ADR-0035](./adr/07-portability-extensibility.md#adr-0035))
`domain.Registered` · `domain.Validated` (DNS/ACME challenge passed) · `domain.CertIssued` · `domain.CertRotated` · `domain.RoutingChanged` (routing-policy decision + chosen target Camps → "why traffic went where")

**Feature flags** ([Plan 37](./contracts-policy-flags.md#plan-37)/[ADR-0044](./adr/04-governance-verification.md#adr-0044))
`flag.Defined` · `flag.Changed` (value/targeting diff + actor — "who flipped what, for whom") · `flag.Evaluated` (sampled, optional, for experiments) · `flag.Archived` (flip-gate decisions ride `policy.Decided`)

**SLO & alerting** ([Plan 14](./reliability-observability-cost.md#plan-14)/[ADR-0045](./adr/04-governance-verification.md#adr-0045)) — SLO/budget state is a projection; these are the decision/notification facts
`slo.Declared` · `slo.BudgetBurned` (burn-rate threshold crossed → policy input) · `alert.Fired` · `alert.Grouped` · `alert.Silenced` · `alert.Inhibited` · `alert.Resolved`

**Incident & SRE** ([Plan 44](./operators-sre.md#plan-44)) — an **Incident** is an aggregate (stream `incident:<id>`, single-writer, rebuildable) that correlates `alert.*`/`slo.BudgetBurned`/`resource.DriftDetected`/`compat.GateFailed` into one command point; the SRE operator ([Plan 40](./operators-sre.md#plan-40)) drives it
`incident.Opened` (cause + severity + impact) · `incident.Triaged` · `incident.RootCauseIdentified` (diagnosis; optional HolmesGPT) · `incident.RemediationProposed` (action + blast radius + `policy.Decided` ref) · `incident.RemediationApplied`/`incident.RemediationFailed` · `incident.Resolved` · `incident.SLABreached` (MTTD/MTTR overrun) · `incident.PostmortemFiled` (replay-generated)
`runbook.Defined` (trigger + diagnosis steps + gated fix actions) · `runbook.Triggered` · `runbook.StepCompleted` · `runbook.Completed`/`runbook.Failed` (built on the Pipelines engine, [Plan 28](./platform-engineering.md#plan-28); remediation applies ride live-fix + `policy.Decided`)

**Chaos** ([ADR-0047](./adr/04-governance-verification.md#adr-0047)) — fault injection is policy-gated + blast-radius-bounded
`chaos.ExperimentStarted` (hypothesis + fault + blast radius) · `chaos.FaultInjected` · `chaos.SteadyStateChecked` · `chaos.Aborted` · `chaos.ExperimentCompleted` (a failed experiment's replay becomes a regression test, [Plan 23](./forge-generated-stack.md#plan-23))

**Training** (`"use training"` semantic-function optimization, [Plan 23](./forge-generated-stack.md#plan-23))
`training.RunStarted` · `training.TrajectoryCaptured` (OTel/OpenInference span tree + I/O) · `training.RewardObserved` (live-eval signal) · `training.CandidateProposed` (rewritten prompt/code) · `training.CandidateEvaluated` · `training.Promoted` · `training.Rejected`

**App communications** (the `notify` port, [Plan 21](./authoring-resources-wiring.md#plan-21)/[ADR-0059](./adr/03-data-plane.md#adr-0059)) — the app messaging *its* end-users via the shared receiver port ([ADR-0045](./adr/04-governance-verification.md#adr-0045)); a send is a `step`, recipient is a `PrincipalRef`
`notification.Requested` (channel + template + recipient + idempotency key) · `notification.Sent` · `notification.Delivered` · `notification.Bounced` · `notification.Failed` (provider callbacks/poll feed the post-send transitions; consent/quiet-hours decisions ride `policy.Decided`)

**Compliance & governance** ([Plan 46](./governance-planes.md#plan-46)) — classification drives enforced residency/retention; erasure honors the forward-only log
`data.Classified` (resource/WIT-field label → the policy `dataClassifications` context) · `governance.ResidencyEnforced`/`governance.RetentionEnforced` (obligation outcomes; violations ride `compat.GateFailed`/`policy.Decided`) · `erasure.Requested` · `erasure.Completed` (crypto-shred key destruction + tombstone → projections rebuild excluding the subject; **no event is rewritten or removed**)

**AI safety & model governance** ([Plan 47](./governance-planes.md#plan-47)) — models/prompts/eval-datasets are signed Registry artifacts; guardrails are policy-gated steps
`model.Registered` (version + provider + model card + provenance) · `model.Promoted` (four-lens gate passed) · `guardrail.Blocked` (which check + the `policy.Decided` ref) · `redteam.ExperimentStarted` · `redteam.FindingRecorded` (→ regression test in a governed eval-dataset) · `redteam.ExperimentCompleted` (chaos-tier sibling, [ADR-0047](./adr/04-governance-verification.md#adr-0047))

**Registry distribution** ([ADR-0062](./adr/07-portability-extensibility.md#adr-0062)) — a governed lifecycle over already-signed/certified artifacts; install ≠ force (Matching binds)
`listing.Published` · `listing.Certified` (signed + `@hobo/conformance`-passed + provenance — uncertified ⇒ unlisted) · `listing.Installed` (extends `provider.Registered`/`pack.Imported`/`forge.Certified`) · `listing.Yanked` (compromised/broken version pulled; installed copies flagged by `hobo doctor`, not silently broken)

**Derivatives** ([Plan 43](./forge-generated-stack.md#plan-43)/[ADR-0068](./adr/07-portability-extensibility.md#adr-0057)) — the `hobo derivative upgrade` ceremony for long-lived forks: check `derivative.json` compat → run pinned upcasters → re-run seam conformance → report
`derivative.UpgradeStarted` · `derivative.UpgradeSucceeded` · `derivative.UpgradeFailed`

### Projections (read models)
Events are the write model; queries read **projections** rebuilt by folding the stream. Initial projections:
- **DeploymentView** — current status + per-resource state for the dashboard timeline.
- **TopologyView** — Bindle resources → resolved providers + options (the topology graph).
- **RunView** — workflow/step/actor/saga trace for the run inspector.
- **CredentialAudit** — every `token.*` event, joined to the run/agent that triggered it.
- **DriftView** — resources whose observed state diverged from desired.

Projections are rebuildable from zero at any time (this is the test that the log is truly authoritative). **Cross-Camp:** a non-owner Camp builds **bounded-staleness projections** from the owner Camp's replicated read-stream — the same fold, fed by replication ([ADR-0040](./adr/05-config-matching-environments.md#adr-0040)/[Plan 5](./reliability-observability-cost.md#plan-05)).

**App domain data uses the same machinery.** The projections above are HoBo's *own* control-plane read models; **application** domain data is event-sourced the same way ([Plan 39](./data-plane.md#plan-39)/[ADR-0050](./adr/03-data-plane.md#adr-0050)): developer-authored, sink-targeted projections fold WIT-record-typed event streams into a backend the **architect** picks via Matching. **Where a read model lives is no longer an open question** — it is architect-selected per context (default = a native standing projection over the log; opt into Postgres/Mongo/… when wanted), recorded in `match.Decided`.

**Two folds, one log (CQRS).** The same stream is folded for two purposes: the **write-model fold** lives in the **aggregate** (an [actor](./sdk-api.md#plan-02), single-writer lease + fencing) and is the authoritative state a **command** checks invariants against before appending under optimistic `seq` ([ADR-0053](./adr/03-data-plane.md#adr-0053)); the **read-model fold** is the projection (above), derived and possibly materialized into a separate sink. The `streamId` ("aggregate/run/actor key") is the consistency boundary; writes are serializable *per aggregate*, never globally (cross-aggregate flows are sagas, [ADR-0040](./adr/05-config-matching-environments.md#adr-0040)).

### Snapshots & compaction
- **Snapshots:** for long-lived streams (actors, the Yard's own state), periodically persist a fold result + the `seq` it covers, so activation replays only the tail. Snapshots are a cache, never a source of truth.
- **Compaction:** runtime `run.*` streams can be archived to cold storage after terminal state + retention window; audit (`token.*`, `resource.*`) streams are retained per compliance policy and never compacted away.

### Schema evolution (versioning events)
- Each `type` carries `v`. Readers run **upcasters**: pure functions `vN → vN+1` chained to the current version, so old events remain replayable forever.
- Additive changes (new optional fields) don't bump `v`. Renames/semantic changes do, with an upcaster.
- Never rewrite history; only add upcasters. This keeps replay/audit guarantees intact across years of schema drift.
- **This is HoBo's *own* event-log evolution.** The developer's **application database** (the `sql` resource) evolves differently — via gated **expand/backfill/contract** migrations + snapshots ([Plan 34](./data-plane.md#plan-34)/[ADR-0032](./adr/03-data-plane.md#adr-0032)). Don't conflate the two: upcasters here, schema migrations there.

### How replay powers durable workflows
A workflow run is a stream of `run.*` events. On resume, the runtime replays the workflow function: each `step()` call checks the stream for a matching `StepCompleted` and returns the cached result if present, otherwise schedules the step (`StepScheduled`), suspends, and resumes when the step worker appends `StepCompleted`. Determinism is enforced by seeding `Math.random`/`crypto` and freezing `Date`/`env` from the run's seed events — identical to the Vercel model, but the `EventStore` is whichever runtime backend the Camp provides. See [Plan 2 §Layer 4](./sdk-api.md#plan-02).

### Iteration hooks
- ULID vs UUIDv7 vs hybrid for `id`.
- Single global log vs per-tenant logs vs per-stream logs (sharding) — interacts with [Plan 12](./security-networking.md#plan-12).
- Exactly which streams are compliance-retained vs compactable.
- Whether projections are push (subscription) or pull (on-read fold with cache).
