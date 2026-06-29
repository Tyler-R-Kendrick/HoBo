# Performance And Load Tests Launch Envelope

Source issue: HOBO-502.

Executable proof lives in
[`src/draft/launch-performance-capacity-envelope-contract`](../../src/draft/launch-performance-capacity-envelope-contract/README.md).
Branch evidence is summarized in
[`proofs/hobo-502-launch-performance-capacity-envelope`](./proofs/hobo-502-launch-performance-capacity-envelope/README.md).

## M0 Acceptance Record

Performance & Load Tests needs an accepted launch envelope before beta, release-candidate, or GA
work can claim performance readiness. This record defines target workflows, expected beta load,
latency and cost thresholds, capacity assumptions, deterministic fixture shape, non-goals, and
handoffs to support and release notes when a threshold is missed. It does not run production load
tests or tune capacity.

## Target Workflows

| Workflow | Persona | Launch tier | Evidence owner |
|---|---|---|---|
| First `hobo plan` / plan-diff | App developer | Beta required | Plan/Diff Viewer |
| First deploy smoke path | App developer | Beta required | Bootstrap Installer |
| Release readiness dashboard refresh | Release owner | RC required | V1 Release Program & Cutline |
| Support evidence lookup | Support operator | Beta required | Support Workflow |

## Expected Beta Load

| Load assumption | Source |
|---|---|
| Up to 25 private-beta workspaces, 5 concurrent active onboarding flows, and 2 concurrent first-deploy flows. | V1 Beta Pilot & Feedback Loop |
| Every release-candidate run may execute deterministic smoke fixtures for SaaS, self-host, local, and cost-envelope replay paths. | Bootstrap Installer |
| Support evidence lookup is optimized for launch triage, not bulk analytics or billing exports. | Support Workflow |

## Thresholds

| Threshold | Beta target | GA target | Miss handling |
|---|---|---|---|
| First plan p95 latency | <= 15s using deterministic fixture inputs | <= 8s using accepted launch fixture inputs | Route to Plan/Diff Viewer with fixture id and trace evidence; list as beta limitation if still above target. |
| First deploy smoke p95 elapsed time | <= 15m for synthetic SaaS path | <= 8m for accepted SaaS path and documented self-host path | Route to Bootstrap Installer with bootstrap artifact and failing step; narrow install claims to the passing path. |
| Readiness dashboard refresh p95 | <= 30s against fixture project set | <= 10s against accepted launch project set | Route to Release Program & Cutline with source-of-truth field id; avoid describing the dashboard as live if unmet. |
| Support evidence lookup p95 | <= 20s for known issue/workspace refs | <= 10s for known issue/workspace refs | Route to Support Workflow with tenant/workspace redaction state; exclude fast lookup from support SLA text if unmet. |
| Cost per launch smoke run | <= 5 USD equivalent per synthetic run | <= 2 USD equivalent per synthetic run or accepted exception | Route to Usage Metering and Entitlements before adding smoke volume; disclose high-cost smoke limitations. |

## Capacity Assumptions

| Assumption | Boundary |
|---|---|
| Launch envelope assumes hosted control-plane defaults from [Plan 05](./reliability-observability-cost.md#plan-05), not tuned production capacity. | Capacity changes require a later M1/M2 load-test issue. |
| Self-host path names minimum fixture resources but does not prove customer production sizing. | Customer production sizing remains release-note and support guidance until drill evidence exists. |
| Envelope fixtures use synthetic or replayable data only. | No live tenant traffic or customer data is used for HOBO-502 proof. |

## Fixture Shape

| Fixture | Data set | Measurement mode | Production execution |
|---|---|---|---|
| Local smoke | Local deterministic sample workspace with one project, one plan, one deploy record, and no provider calls. | Node contract fixture | No |
| SaaS beta synthetic | Synthetic hosted workspace and first-deploy artifact ids. | Contract fixture with stubbed provider timings | No |
| Self-host synthetic | Synthetic self-host bootstrap path, minimum resource class, and unsupported-state rows. | Contract fixture with declared resource envelope | No |
| Cost envelope replay | Usage, billing, and entitlement fixture facts with deterministic cost counters. | Event replay fixture | No |

## Cost Guardrails

| Owner | Rule | Boundary |
|---|---|---|
| Usage Metering | Every cost threshold must trace to accepted usage fact classes and dimensions. | This record does not create a metering projection or ingest live usage. |
| Billing & Credits | Envelope cost misses route to invoice/support wording but do not generate invoices. | This record does not add payment, invoice, refund, tax, or provider billing integration. |
| Entitlements & Plan Limits | Capacity and cost limits that become customer-visible must map to entitlement policy before launch. | This record does not enforce quota, abuse response, rate limits, or suspension. |

## Authoritative Dependencies

- [Plan 05](./reliability-observability-cost.md#plan-05) owns reliability, observability, SLO, and
  cost/FinOps concepts consumed by the launch envelope.
- [Usage Metering](./usage-metering.md) owns usage fact classes, attribution dimensions, and
  reconciliation/support evidence.
- [Billing Launch Policy](./billing-launch-policy.md) owns invoice, payment, refund, credit, tax,
  and provider boundary language.
- [V1 Release Notes and Upgrade Guide](./release-notes-upgrade-guide.md) owns customer-facing
  release wording when thresholds are missed.
- [Launch Support Escalation](./launch-support-escalation.md) owns support routing and support SLA
  language.

## Scope Out And Non-Goals

- Do not execute production load tests, use live customer traffic, or claim production capacity in
  HOBO-502.
- Do not tune autoscaling, provision capacity, or implement load-test infrastructure.
- Do not implement usage billing, invoices, payment collection, tax, refunds, rate limits, or
  entitlements.
- Do not create downstream M1-M4 execution issues before M0 envelope acceptance is reviewed.

## Evidence Required For M1

| Evidence | Owner | Proof mode | Proves |
|---|---|---|---|
| Envelope fixture | Performance & Load Tests | Contract test | Workflows, load assumptions, thresholds, capacity assumptions, fixture shape, and non-goals are defined. |
| Threshold routing table | Support / Release | Design record | Missed thresholds route to support and release notes rather than disappearing. |
| Cost guardrail table | Usage Metering / Billing / Entitlements | Contract test | Cost limits align with owning initiatives before launch claims expand. |
| Scope guard | Release cutline | Contract test | Production load execution and hidden billing/entitlement work stay out of HOBO-502. |

## Follow-Up Gate

M1/M2/M3/M4 performance, capacity, or load-test execution issues must wait until this M0 envelope
is accepted. This branch records the envelope and executable guard; it does not run production load
or claim production capacity.
