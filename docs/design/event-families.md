---
type: Reference
title: "HoBo Event Families"
description: "This catalog is the canonical event-family inventory for design docs. Add a family here before using a new backticked event name elsewhere."
tags: [hobo, design]
---

# HoBo Event Families

This catalog is the canonical event-family inventory for design docs. Add a family here before using a new backticked event name elsewhere.

| Family | Example events |
|---|---|
| `actor.*` | `actor.Activated`, `actor.StateAppended` |
| `aggregate.*` | `aggregate.PastTenseFact` |
| `alert.*` | `alert.Fired`, `alert.Grouped`, `alert.Routed`, `alert.Silenced`, `alert.Inhibited`, `alert.Deduped`, `alert.InhibitionCycleRejected`, `alert.Resolved` |
| `bindle.*` | `bindle.ResourcesCollected`, `bindle.ManifestProduced` |
| `breakglass.*` | `breakglass.Requested`, `breakglass.Approved`, `breakglass.Started`, `breakglass.Used`, `breakglass.Revoked` |
| `camp.*` | `camp.Created`, `camp.RuntimeBound` |
| `capability.*` | `capability.Denied` |
| `chaos.*` | `chaos.ExperimentStarted`, `chaos.FaultInjected` |
| `compat.*` | `compat.GatePassed`, `compat.GateFailed` |
| `config.*` | `config.Resolved` |
| `contract.*` | `contract.Observed`, `contract.Verified` |
| `credit.*` | `credit.Registered`, `credit.Reset`, `credit.Exhausted`, `credit.BudgetCapSet` |
| `crew.*` | `crew.ActionProposed`, `crew.HandoffRequested` |
| `data.*` | `data.Changed`, `data.Classified` |
| `delta.*` | `delta.Opened`, `delta.Applied` |
| `deploy.*` | `deploy.PreviewUrlAssigned`, `deploy.PreviewTeardownRequested` |
| `deployment.*` | `deployment.Planned`, `deployment.PlanRejected` |
| `derivative.*` | `derivative.UpgradeStarted`, `derivative.UpgradeSucceeded` |
| `dispatch.*` | `dispatch.Decided` |
| `drift.*` | `drift.RemediationRouted`, `drift.DiffProposed` |
| `domain.*` | `domain.Validated`, `domain.RoutingChanged` |
| `env.*` | `env.Cloned`, `env.Promoted` |
| `erasure.*` | `erasure.Requested`, `erasure.Completed` |
| `eval.*` | `eval.Ran`, `eval.GateFailed` |
| `exec.*` | `exec.Started`, `exec.Succeeded` |
| `experiment.*` | `experiment.Assigned`, `experiment.Concluded` |
| `flag.*` | `flag.Defined`, `flag.Changed` |
| `gen.*` | `gen.Requested`, `gen.PluginCertified` |
| `golden.*` | `golden.Ran`, `golden.Passed` |
| `governance.*` | `governance.ResidencyEnforced` |
| `guardrail.*` | `guardrail.Blocked` |
| `identity.*` | `identity.Issued`, `identity.Rotated`, `identity.PartitionGraceEntered`, `identity.PartitionGraceExpired` |
| `impl.*` | `impl.Generated`, `impl.Promoted` |
| `incident.*` | `incident.Opened`, `incident.Resolved` |
| `junction.*` | `junction.TrustEstablished`, `junction.ArtifactShared` |
| `lane.*` | `lane.Revoked` |
| `link.*` | `link.Established`, `link.Called` |
| `listing.*` | `listing.Published`, `listing.Certified`, `listing.Yanked` |
| `livefix.*` | `livefix.Proposed`, `livefix.Applied` |
| `match.*` | `match.Decided` |
| `meter.*` | `meter.UsageRecorded` |
| `migration.*` | `migration.Planned`, `migration.CutOver` |
| `model.*` | `model.Registered`, `model.Promoted` |
| `notification.*` | `notification.Requested`, `notification.Delivered` |
| `pack.*` | `pack.Imported` |
| `pipeline.*` | `pipeline.Triggered`, `pipeline.Completed` |
| `policy.*` | `policy.Decided`, `policy.ObligationCreated` |
| `projection.*` | `projection.Declared`, `projection.Lagged` |
| `provider.*` | `provider.Registered`, `provider.Deprecated` |
| `query.*` | `query.*` |
| `redteam.*` | `redteam.FindingRecorded` |
| `registry.*` | `registry.BundleImported` |
| `resource.*` | `resource.Provisioned`, `resource.DriftDetected` |
| `resourcedef.*` | `resourcedef.Registered`, `resourcedef.Updated` |
| `rollout.*` | `rollout.Started`, `rollout.RolledBack` |
| `run.*` | `run.Started`, `run.StepCompleted` |
| `runbook.*` | `runbook.Defined`, `runbook.Triggered`, `runbook.StepCompleted`, `runbook.Completed`, `runbook.Failed` |
| `saga.*` | `saga.Started`, `saga.Compensated` |
| `secret.*` | `secret.Accessed`, `secret.Unavailable` |
| `session.*` | `session.Started`, `session.Refreshed`, `session.Revoked` |
| `set.*` | `set.Created` |
| `slo.*` | `slo.Declared`, `slo.BudgetBurned` |
| `spend.*` | `spend.Recorded`, `spend.CircuitTripped`, `spend.CircuitReset`, `spend.DegradationRequired`, `spend.DegradationApplied`, `spend.DegradationRolledBack` |
| `statuspage.*` | `statuspage.Published`, `statuspage.IncidentPosted` |
| `stub.*` | `stub.Recorded` |
| `subscription.*` | `subscription.Opened`, `subscription.Pushed` |
| `tenant.*` | `tenant.Suspended`, `tenant.Resumed` |
| `token.*` | `token.Granted`, `token.Used`, `token.Denied`, `token.Revoked` |
| `training.*` | `training.RunStarted`, `training.Promoted` |
| `user.*` | `user.Authenticated` |
| `ws.*` | `ws.Connected`, `ws.Subscribed` |
