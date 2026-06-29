---
type: Reference
title: "Launch Support Escalation Matrix"
description: "Source issue: HOBO-408."
tags: [hobo, design]
---

# Launch Support Escalation Matrix

Source issue: HOBO-408.

Executable proof lives in
[`src/draft/launch-support-escalation-matrix`](../../src/draft/launch-support-escalation-matrix/README.md).
Branch evidence is summarized in
[`proofs/hobo-408-launch-support-escalation`](./proofs/hobo-408-launch-support-escalation/index.md).

## M0 Acceptance Record

Launch support needs a concrete escalation matrix before beta and GA readiness work can claim that
customer-impacting incidents have an owner, a communication path, and a handoff rule. This record
defines severity levels, support/debug prerequisites, draft customer communication templates, and
gap routing. It does not implement support tooling or promise public response SLAs.

## Role Coverage

| Role | Responsibility |
|---|---|
| Support lead | Owns intake quality, customer context, and support queue handoff. |
| Incident commander | Coordinates severity, owner routing, and incident record hygiene. |
| First responder | Starts triage, gathers evidence, and confirms first escalation path. |
| Customer communications owner | Publishes approved customer updates after redaction and evidence checks. |
| Release owner | Approves launch readiness gaps and any response commitment language. |

## Severity Matrix

| Severity | First responder | Escalation owner | Expected response | Customer communication | Handoff criteria |
|---|---|---|---|---|---|
| SEV0: customer-impacting outage or data safety risk | On-call first responder | Incident commander plus operators/SRE owner | Begin live triage, open an incident record, and escalate to the incident commander immediately. | Status page plus named customer channel when affected accounts are known. | Impact is confirmed or unknown after initial triage; data safety, auth, networking, or rollback decision is needed; customer update needs approval. |
| SEV1: major degraded production path | Support lead or on-call first responder | Operators/SRE owner | Open an incident record, attach evidence, and route to the owning operational lane. | Status page when customer-visible, otherwise support ticket update. | Workaround is unavailable or unverified; rollback, provider escalation, or runbook action is required. |
| SEV2: limited feature regression or support-facing defect | Support lead | Admin console or product release owner | Collect reproduction evidence, classify the affected product lane, and file a follow-up issue. | Support ticket update. | Support cannot resolve from documented evidence; defect requires admin tooling, product decision, or customer-specific mitigation. |
| SEV3: question, documentation gap, or launch readiness follow-up | Support queue owner | Support lead | Answer from approved launch material or route the gap to the owning readiness project. | Support ticket or launch FAQ update. | No approved answer exists; question exposes a missing beta or GA readiness criterion. |

This severity model aligns with incident ownership and on-call obligations from
[Plan 40](./operators-sre.md#plan-40), status-page publication from
[Plan 49](./developer-experience.md#plan-49), alert/observability evidence from
[Plan 05](./reliability-observability-cost.md#plan-05), and the incident aggregate from
[ADR-0058](./adr/03-data-plane.md#adr-0058).

## Support And Debug Prerequisites

| Area | Owner lane | Prerequisite |
|---|---|---|
| Observability access | Reliability/observability/cost | Support can read scoped metrics, logs, traces, and SLO burn context for affected projects. |
| Incident timeline | Operators/SRE | Incident records preserve opened, classified, escalated, mitigated, and resolved events. |
| Tenant context | Admin console | Support can identify affected account, project, environment, plan, and entitlement context without secret exposure. |
| Status-page redaction | Support | Customer updates pass redaction review before internal incident details become public status text. |
| Runbook notification | Operators/SRE | Runbook and `hobo:notify` handoffs expose owner, acknowledgement, escalation, and deadline state. |
| Release and feature context | Support | Support can map a ticket to launch phase, feature flag, release, and known limitation evidence. |

## Incident Communication Templates

These are draft templates. Before public use, each message must pass redaction review and be backed
by the incident record or linked responder evidence.

| Template | Audience | Channel | Required evidence |
|---|---|---|---|
| Initial acknowledgement | Affected customers | Support ticket or status page | Incident record impact summary. |
| Investigation update | Affected customers and launch stakeholders | Support ticket, status page, or launch-room update | Incident timeline and responder notes. |
| Mitigation update | Affected customers and launch stakeholders | Support ticket or status page | Mitigation event and runbook output. |
| Resolution follow-up | Affected customers and internal launch review | Support ticket, status page resolution, or postmortem note | Resolved incident record and follow-up issue links. |

Required placeholders are `incident_id`, impact or affected capability, current status, next update
condition, and follow-up owner when known. Templates must not include response-time guarantees unless
the release owner explicitly approves customer-facing SLA language.

## Gap Routing

| Gap | Owner lane | Follow-up project |
|---|---|---|
| Missing support queue procedure, FAQ, or customer response owner | Support | V1 Launch Support Desk & Escalation |
| Missing customer, tenant, project, entitlement, or launch phase visibility | Admin console | V1 Admin Console & Operator UX |
| Missing incident command, runbook, on-call, `hobo:notify`, or escalation evidence | Operators/SRE | Operator Agents, SRE & Incident Response |
| Missing metrics, logs, traces, SLO burn, alert routing, or cost context | Reliability/observability/cost | Reliability, Observability & Cost Controls |

## Scope Out And Non-Goals

- Do not implement support tooling, ticket automation, admin console surfaces, status-page publish
  flows, runbook execution, or notification dispatch in HOBO-408.
- Do not promise response SLAs, time-to-response commitments, or public support tiers without owner
  approval.
- Do not replace Plan 40 incident management, Plan 49 status-page contracts, or Plan 05
  observability/alert routing.
- Do not create M1-M4 implementation tasks before the M0 escalation record is accepted.

## Follow-Up Gate

Downstream support, admin console, operators/SRE, and reliability implementation issues may cite this
record only after it is accepted. Until then, the branch proves readiness shape and scope guards, not
production support capability.
