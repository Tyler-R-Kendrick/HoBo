---
type: Reference
title: "Customer Onboarding Script and Success Criteria"
description: "Source issue: HOBO-487."
tags: [hobo, design]
---

# Customer Onboarding Script and Success Criteria

Source issue: HOBO-487.

Executable proof lives in
[`src/draft/customer-onboarding-script-contract`](../../src/draft/customer-onboarding-script-contract/README.md).
Branch evidence is summarized in
[`proofs/hobo-487-customer-onboarding-script`](./proofs/hobo-487-customer-onboarding-script/README.md).

## M0 Acceptance Record

Customer Onboarding owns the repeatable first-customer script that customer success can use during
private beta. The script makes pilot evidence comparable across customers while keeping product
onboarding, support tooling, deploy runtime, billing, and legal approval out of scope.

## User And Business Goal

Private beta needs a consented, customer-safe script that gets a pilot from invite to workspace,
project choice, first accepted proof or blocker, recovery, support handoff, and feedback capture.
Release owners need the outcome to classify blockers, support gaps, docs gaps, product UX gaps, and
engineering gaps without reading private customer data.

## Primary Personas

| Persona | Need |
|---|---|
| Pilot customer champion | Understand the first HoBo journey, choose a sample or real project, and know when to stop for support. |
| Customer success lead | Run a repeatable script that captures comparable first-success and blocker evidence across pilots. |
| Support engineer | Receive stalled-stage, owner, safe next action, and evidence links without reading private project data. |
| Release owner | Classify pilot outcomes into cutline, docs, support, product UX, or engineering follow-up before beta or GA claims. |

## Scope In

- Scripted invite, preparation, workspace setup, sample-or-real project choice, first deploy proof,
  failure recovery, support handoff, and feedback capture.
- Customer-visible success criteria for time-to-first-success, blocker categories, handoff quality,
  and unresolved risk.
- Routing matrix for pilot notes into cutline, docs, Workspace & Onboarding UX, Support Workflow,
  or owning engineering project.
- Evidence and consent gate for future pilot usage without collecting live customer data in this
  proof package.

## Scope Out And Non-Goals

- Do not automate onboarding, build a product wizard, create a customer-success platform, create a
  support queue, or implement support tools.
- Do not capture live customer data, onboard production customers, approve billing conversion,
  provide legal approval, or publish launch claims.
- Do not provision real cloud resources, handle provider credentials, implement deploy runtime, or
  execute a real first deploy.
- Do not create M1-M4 implementation issues before this script contract is accepted.

## Service, UX, Security, And Support Boundaries

| Boundary | Rule |
|---|---|
| Service | Customer Onboarding owns the script, pilot evidence fields, and handoff record; account, workspace, deploy, billing, and support services remain with their owning projects. |
| UX | The script references the first-run path but does not build onboarding UI, product tours, dashboards, or notification copy. |
| Security | Pilot evidence avoids secrets, provider credentials, raw customer project data, and policy bypasses; consent and unsupported-state labels are mandatory before use. |
| Support | Support receives stage, blocker category, safe next action, owner, and evidence link; support SLAs, ticket queues, and remediation remain separate. |

## Authoritative Dependencies

- [Workspace & Onboarding UX](./workspace-onboarding-ux.md) defines first-run activation stages,
  stalled states, and support handoff fields consumed by pilot scripts.
- [Example Apps](./example-apps.md) supplies accepted sample-app proof modes when a pilot chooses a
  sample project instead of a real project.
- [Beta Pilot Feedback](./beta-pilot-feedback.md) defines comparable feedback intake and
  release-candidate exit rules for private-beta evidence.
- [Launch Demo Golden Path](./launch-demo-golden-path.md) keeps launch demo assets separate from
  customer onboarding while reusing proof-mode language.
- [Launch Support Escalation](./launch-support-escalation.md) defines support escalation language
  that the script may hand off to without creating support tooling.
- [Launch Blocker Taxonomy](./launch-blocker-taxonomy.md) supplies blocker, high-risk non-blocker,
  launch-note, and post-GA follow-up classes for pilot outcomes.

## Script Stages

| Stage | Owner | Expected Evidence |
|---|---|---|
| Invite | Customer success lead | Pilot intake record with persona, consent, support owner, and target workflow. |
| Workspace setup | Pilot customer champion | Workspace setup note with owner, state, missing prerequisite, and safe next action. |
| Project choice | Customer success lead | Sample-or-real project decision with proof mode, data boundary, and unsupported-state note. |
| First deploy | Pilot customer champion | First deploy evidence link, refusal, or blocker category with proof mode. |
| Failure recovery | Support engineer | Recovery note with blocker category, owner, safe next action, and escalation threshold. |
| Support handoff | Support engineer | Support handoff record with severity, owner, evidence link, and customer-safe message. |
| Feedback capture | Release owner | Feedback record routed to cutline, docs, product UX, support, or engineering follow-up. |

## Success Criteria

| Criterion | Owner | Measures |
|---|---|---|
| Time to first success | Customer success lead | Elapsed time from invite acceptance to first accepted proof evidence or explicit blocker. |
| Blocker categories | Release owner | Each stop is classified as blocker, high-risk non-blocker, support gap, docs gap, product UX gap, or engineering gap. |
| Handoff quality | Support engineer | Every handoff names stage, owner, safe next action, evidence link, and customer-safe message. |
| Unresolved risk | Release owner | Open risks carry owner, mitigation, launch-note or cutline route, and revisit condition. |

## Pilot Note Routing

| Pilot Note Category | Owning Surface |
|---|---|
| Support gap | Support Workflow |
| Product UX | Workspace & Onboarding UX |
| Docs gap | V1 Release Notes & Upgrade Guide |
| Engineering gap | Owning engineering project |
| Go/no-go risk | V1 Release Program & Cutline |

## Follow-Up Gate

Customer onboarding automation, pilot execution, support tooling, or downstream implementation work
must wait until this script contract is accepted. Future usage also requires script review, assigned
support owner, and captured customer consent.
