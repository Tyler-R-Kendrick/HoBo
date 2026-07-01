---
type: Reference
title: "Dogfood Yard Acceptance Scenarios and Telemetry Evidence"
description: "Source issue: HOBO-403."
tags: [hobo, design]
---

# Dogfood Yard Acceptance Scenarios and Telemetry Evidence

Source issue: HOBO-403.

Executable proof lives in
[`src/draft/dogfood-yard-acceptance-contract`](../../src/draft/dogfood-yard-acceptance-contract/README.md).
Branch evidence is summarized in
[`proofs/hobo-403-dogfood-yard-acceptance`](./proofs/hobo-403-dogfood-yard-acceptance/README.md).
M1 dogfood/alpha evidence proof lives in
[`src/draft/dogfood-yard-m1-evidence-contract`](../../src/draft/dogfood-yard-m1-evidence-contract/README.md)
and is summarized in
[`proofs/hobo-455-dogfood-yard-m1-evidence`](./proofs/hobo-455-dogfood-yard-m1-evidence/README.md).

## M0 Acceptance Record

Dogfood Yard exists to make hosted and self-hosted Yard claims inspectable before private beta. The
record defines the personas, workflows, evidence channels, and owner boundaries required before
downstream dogfood, bootstrap, admin, and reliability work can claim operational proof.

## User And Business Goal

HoBo needs a repeatable way to prove that the same Yard model works as a hosted managed service and
as a self-hosted control plane. The evidence must support release decisions without relying on
private local setup, hidden customer data, or unbounded "it worked once" claims.

## Dogfood Personas

| Persona | Need |
|---|---|
| Platform engineer dogfooder | Stand up and operate a self-hosted Yard without private setup knowledge. |
| Hosted operations owner | Prove the managed hosted Yard can run preview and default-provider workflows with inspectable evidence. |
| SRE/support responder | Debug failed Yard operations from logs, traces, status views, and support-safe evidence. |
| Release readiness owner | Classify dogfood gaps as beta blockers, launch notes, or follow-up work. |

## Workflows

- Hosted Yard default-provider preview from first project to first deploy evidence.
- Self-host seed Yard bootstrap, Identity handover, and seed retirement evidence.
- Yard upgrade with rollback signal and status-page impact classification.
- Incident debug and restore-from-log drill without live customer data.

## Acceptance Scenarios

| Scenario | Yard mode | Proves |
|---|---|---|
| `hosted-yard-preview-path` | Hosted | Hosted cloud can accept a first project, infer a Camp, run a preview deploy, and expose status evidence. |
| `self-hosted-seed-handover` | Self-hosted | A local seed Yard can bootstrap the real Yard, import provenance, hand over Identity, and retire the seed. |
| `yard-upgrade-and-rollback` | Hosted or self-hosted | Yard upgrades ride the normal deploy gate and emit rollback-ready signals. |
| `incident-debug-and-restore` | Hosted or self-hosted | Operators can diagnose and restore from event-log evidence without customer-data leakage. |

## Required Evidence Channels

| Channel | Owner category | Proves | Redaction rule |
|---|---|---|---|
| Logs | Operational | Yard bootstrap, deploy, upgrade, incident, and recovery steps produce correlated operator-readable logs. | No provider secrets, live customer payloads, or tenant data may appear in log fixtures. |
| Traces | Reliability | Yard operations preserve request/deploy correlation across control-plane boundaries. | Trace attributes stay to ids, timings, and state transitions; no customer payload spans. |
| Status views | Admin | Hosted and self-hosted Yard health, degraded state, maintenance, and readiness are visible to operators. | Status views expose aggregate state and evidence links, not raw customer data. |
| Support/debug | Admin | Support can inspect safe evidence bundles for bootstrap, deploy, incident, and recovery handoff. | Debug bundles must be support-safe and tenant-scoped before export. |
| Rollback signals | Bootstrap | Yard upgrade, deploy failure, and restore paths emit rollback-ready state and operator action cues. | Rollback evidence records state ids and prior Set/provenance pointers, not provider credentials. |

## Authoritative Dependencies

- [control-plane.md#plan-04](./control-plane.md#plan-04) defines the Yard control plane,
  self-host bootstrap ordering, and seed-to-real Yard handover.
- [walkthrough.md](./walkthrough.md) defines hosted versus self-hosted HoBo cloud flows and the
  DevOps self-host journey.
- [developer-experience.md#plan-07](./developer-experience.md#plan-07) defines inspect, logs,
  status, and command evidence users expect around Yard operations.
- [reliability-observability-cost.md#plan-05](./reliability-observability-cost.md#plan-05) defines
  telemetry, traces, SLO signals, rollback evidence, and operational status inputs.
- [operators-sre.md#plan-40](./operators-sre.md#plan-40) defines support, SRE, incident, and
  runbook handoff loops for Yard operations.
- [ADR-0092](./adr/01-architecture-core.md#adr-0092) pins self-host bootstrap as disposable seed
  Yard, provenance import, and Identity handover.

## Evidence Ownership

| Category | Owner project | Consumes | Boundary |
|---|---|---|---|
| Operational | V1 Dogfood Yard & Hosted Operations | Owns hosted/self-hosted scenario acceptance and dogfood gap classification. | Does not implement Yard runtime or mark launch readiness. |
| Admin | Admin Console | Owns status, support-safe debug, and operator visibility requirements. | Does not build admin UI or support tooling in this M0 issue. |
| Bootstrap | Bootstrap Installer | Owns seed Yard bootstrap, handover, and local/self-host install evidence. | Does not implement installer or bootstrap commands here. |
| Reliability | Reliability, Observability & Cost (FinOps) | Owns telemetry, trace correlation, SLO, rollback, and restore evidence quality. | Does not create observability pipelines or production SLO gates. |

## Scope Out And Non-Goals

- Do not build the Yard or any hosted operations runtime in this issue.
- Do not provision live cloud resources, store provider credentials, or call production provider APIs.
- Do not use live customer data for proof or support/debug fixtures.
- Do not mark beta or GA readiness; this issue defines the acceptance evidence required later.

## Follow-Up Gate

M1/M2/M3/M4 dogfood evidence, admin UI, bootstrap installer, and reliability implementation issues
must wait until this M0 evidence scope is accepted. This branch records the gate and its executable
guard; it does not create follow-up implementation issues.

## M1 Dogfood/Alpha Evidence Gate

HOBO-455 records the first follow-up evidence gate for V1 Dogfood Yard & Hosted Operations. The M1
record requires scenario fixture manifests, safe telemetry bundles, rollback or recovery paths, a
gap classification ledger, and a release-cutline dependency map for the hosted preview,
self-hosted seed handover, upgrade/rollback, and incident restore scenarios. The evidence gate
routes missing proof to beta blockers, launch notes, or owning follow-up work; it does not build
the Yard runtime, admin UI, bootstrap installer, observability pipeline, release notes, or release
cutline workflow.

## Hosted Broker GA Handoff Link

HOBO-530 consumes Dogfood Yard evidence as a deploy-readiness link for the hosted broker. Resolution
Receipts prove that Yard can consume broker authority from signed manifest, environment, and catalog
digests. Resolution Rejections prove stale, incompatible, ambiguous, or unsupported broker mappings
fail closed before Yard planning.

This link does not mark the hosted broker live GA-ready on its own. Dogfood evidence remains an
input to release-cutline and broker handoff review, and cannot be replaced by local fixtures, docs,
or manually edited receipts.

## M4 GA Handoff Evidence

Source issue: HOBO-476.

Executable proof lives in
[`src/draft/dogfood-yard-ga-handoff-evidence-contract`](../../src/draft/dogfood-yard-ga-handoff-evidence-contract/README.md).
Branch evidence is summarized in
[`proofs/hobo-476-dogfood-yard-ga-handoff`](./proofs/hobo-476-dogfood-yard-ga-handoff/index.md).

The M4 gate records Dogfood Yard and hosted operations handoff evidence for:

- accepted Dogfood Yard M0/M1 evidence plus current M2/M3 predecessor review state;
- hosted broker deploy-readiness links from HOBO-530;
- safe smoke, telemetry, support/debug, rollback, restore, and self-host handoff evidence;
- release-cutline dependencies across operations-readiness, release-cutline, support,
  documentation, reliability, bootstrap, and broker owner lanes; and
- the existing HOBO-475 release-program GA handoff follow-up for final go/no-go evidence.

The accepted M4 handoff lowers launch risk for Dogfood Yard evidence review, but it does not publish
public GA readiness, production recovery, SLA, or live hosted-operations claims. Yard runtime,
hosted operations runtime, admin UI, bootstrap installer, support tooling, status-page publication,
release automation, provider operations, and customer-data handling remain outside this branch.
