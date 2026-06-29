# Beta Pilot Feedback Contract

HOBO-404 defines the M0 private-beta program contract: who can be a pilot, what
feedback must capture, where findings route, and when beta evidence can support a
release-candidate decision.

## Goal

Private beta feedback must become comparable launch evidence, not ad hoc notes. The
contract links each feedback item to a persona, environment, workflow, severity,
evidence, and customer impact so release triage can decide whether it is a blocker,
known limitation, support gap, product UX gap, docs gap, or capability follow-up.

## Cohort Criteria

| Criterion | Required evidence | Owner |
|---|---|---|
| Target persona fit | Pilot maps to app developer, platform engineer, support/operator, security reviewer, admin, or buyer workflow. | Beta program owner |
| Workflow readiness | Fixture, environment, rollback/support posture, and expected evidence are defined before pilot exposure. | Workflow owner |
| Support capacity | First responder, escalation owner, and support window are available. | Support lead |
| Feedback consent | Pilot accepts structured feedback capture and customer-impact classification. | Beta program owner |
| Exclusion rules | Unsupported jurisdictions, regulated data without approval, and workflows lacking rollback/support evidence are excluded. | Release owner |

## Feedback Intake

Every beta feedback item must include:

- persona;
- environment;
- workflow;
- severity;
- evidence;
- customer impact.

Severity values are `blocker`, `high-risk-non-blocker`, `support-request`,
`usability`, `docs-gap`, `capability-gap`, and `launch-note`.

## Triage Routes

| Destination | Use when | Owner |
|---|---|---|
| Cutline | Go/no-go risk, open blocker, exception request, or launch readiness decision. | V1 Release Program & Cutline |
| Support | Support path, escalation, severity communication, or first-week coverage gap. | V1 Launch Support Desk & Escalation |
| Product UX | Onboarding, dashboard, plan/diff, or activation usability problem. | Workspace & Onboarding UX |
| Docs | Release note, upgrade guide, known limitation, or troubleshooting gap. | V1 Release Notes & Upgrade Guide |
| Capability project | Provider, runtime, identity, billing, marketplace, or other capability gap. | Owning capability project |

## Release Candidate Exit

Beta evidence can support release-candidate promotion only when:

- no blocker-severity beta feedback remains open;
- app developer, platform engineer, and support/operator workflows have evidence or accepted limitations;
- required feedback evidence is attached or explicitly accepted as a limitation;
- unresolved high-risk non-blockers have owner-approved launch notes or exceptions.

## Scope Boundaries

This record does not onboard beta customers, implement support tooling, create
general product feedback infrastructure, or resolve blockers surfaced by beta
feedback. It only defines the intake and triage contract those later issues use.

## Proof

Executable proof lives in
[`../../src/draft/beta-pilot-feedback-contract`](../../src/draft/beta-pilot-feedback-contract/README.md).
