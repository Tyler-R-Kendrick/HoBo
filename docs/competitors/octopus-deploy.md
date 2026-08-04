---
type: Competitive Reference
title: "Octopus Deploy — Competitor Reference"
description: "Release-orchestration and deployment-automation platform (environments, lifecycles, tenants, runbooks, manual interventions); captured for HoBo's promotion/stage-gate/runbook surfaces."
tags: [hobo, competitors]
---

# Octopus Deploy — Competitor Reference

> Captured for HoBo competitive analysis; researched August 2026. This file
> documents **Octopus Deploy's** offering faithfully; the HoBo↔Octopus
> mapping/parity tracker lives in the [HoBo mapping](#hobo-mapping) section
> below. Factual API/config surface quoted under fair use.

## Positioning

- **Tagline:** *"Best-in-class continuous delivery"* — release orchestration
  and deployment automation as its own product, downstream of CI.
- **Paradigm:** model the *delivery* domain explicitly — projects, releases,
  environments, lifecycles, channels, tenants, runbooks — rather than treating
  deploys as CI pipeline scripts. Commercial (server or cloud), with strong
  enterprise/regulated-org adoption.

## Feature surface

### Delivery model
- **Project → Release → Deployment**: a release pins package versions +
  process snapshot; deployments push a release through **Environments**
  (dev → test → prod) governed by a **Lifecycle** with phases and automatic or
  manual promotion rules; **Channels** allow parallel release streams with
  version rules.
- **Deployment process**: ordered steps (script, package deploy, K8s, Helm,
  Terraform, IIS/Azure/AWS built-ins) with conditions, rolling windows, and
  guided failure mode.
- **Manual interventions & approvals**: explicit pause-for-human steps with
  responsible teams recorded in the audit trail; ITSM integrations
  (ServiceNow/Jira) gate on change tickets.
- **Multi-tenancy**: **Tenants** (customers/regions/stores) deploy the same
  project many times with tenant-scoped variables and tenant tags — the
  canonical "deploy per customer" machinery.
- **Runbooks**: operational procedures (restart, backup, cert rotation)
  modeled beside deployments — same steps/variables/targets/audit, runnable
  on demand or scheduled, independent of a release.
- **Variables**: scoped variable sets (environment/tenant/target/channel),
  sensitive variables, library variable sets shared across projects.
- **Targets & workers**: agent (Tentacle) or agentless (SSH/K8s) deployment
  targets grouped by role; worker pools for step execution.

### Ops & governance
- Full audit trail of every deployment/intervention; RBAC with teams/roles;
  spaces for org partitioning; Config-as-Code (OCL in Git) for processes.

## Differentiators

### Strengths
- The **delivery domain model** — environments/lifecycles/channels/tenants as
  first-class nouns — is the clearest articulation in the industry; promotion
  rules and per-tenant fan-out need no scripting.
- **Runbooks beside deployments** unify "deploy" and "operate" audit surfaces.
- Manual intervention/ITSM gating fits regulated change management.

### Gaps (opportunities for HoBo)
- No application model: Octopus orchestrates *packages onto targets*; the app's
  resources/infrastructure come from elsewhere (Terraform steps at best).
- Not provider-negotiated: environments point at pre-existing infrastructure;
  no matching, no cost-aware placement, no IaC ownership.
- Agent/AI surface is thin; audit is a log, not a replayable event source.

## HoBo mapping

> Legend: ✅ parity · ➕ HoBo goes further · ◐ HoBo thinner · 🔜 planned.
> HoBo is design-phase; Octopus ships today — maturity credit is Octopus's.

| Octopus concept | HoBo equivalent | Notes |
|---|---|---|
| Release (pinned versions + process snapshot) | **Deployment Set** (immutable) + Deltas | ✅ same immutability bet ([Plan 25](../design/platform-engineering.md#plan-25)) |
| Environment + Lifecycle phases | Camps with environment types; promote via `can-deploy`/Gatekeeper | ✅➕ promotion is a policy-gated event, replayable |
| Channels | 🔜 no direct analog; nearest is per-env matching criteria | ◐ |
| Manual intervention / ITSM gate | `require-approval` policy effect + A2H handoff (ADR-0094) | ✅➕ approvals are policy, not process steps |
| Tenants + tenant variables | App-tenant model (Plan 50), per-tenant config/quotas; tenant-scoped deploys | ✅ different substrate (streams, not variable scoping) |
| **Runbooks** | `hobo runbook` verb + StackStorm-informed operator automation ([technologies/stackstorm](../technologies/stackstorm.md), [operators-sre](../design/operators-sre.md#plan-40)) | ◐ HoBo's runbooks are Crew/agent-first; Octopus's human-first maturity is ahead |
| Guided failure / rolling windows | Progressive rollout engine (Harness/OpenDelivery) + Trails compensation | ✅➕ auto-abort on dual-oracle failure |
| Audit trail | Event-sourced journal — audit *is* the source of truth | ➕ replay/time-travel |
| Config-as-Code (OCL) | Bindle TypeScript IR + policy packs in Git | ✅ |

**The borrowing HoBo takes:** the **delivery domain model as first-class
nouns** — HoBo's Deployment Sets/environment types/promotion gates credit this
lineage (via Humanitec and Octopus jointly), and Octopus's
runbooks-beside-deployments framing (one audit surface for deploy *and*
operate) is the exact shape of HoBo's runbook verb + Crew operations.

**The one-line takeaway:** Octopus proves the delivery domain deserves its own
model — environments, promotion, tenants, runbooks, approvals — and HoBo
absorbs that model into an event-sourced, policy-gated, provider-negotiated
control plane instead of a downstream orchestrator.

## Sources

- https://octopus.com/docs — environments, lifecycles, tenants, runbooks
- https://octopus.com/docs/projects/config-as-code — OCL
