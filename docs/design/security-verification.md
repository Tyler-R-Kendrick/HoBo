# V1 Security Verification

This record pins the v1 vulnerability disclosure and security launch-blocker process for
HOBO-494. It is a launch-readiness contract, not a production workflow implementation.

## Goal

HoBo v1 needs a clear path for vulnerability reports and release-blocking security findings before
beta and paid GA claims can be made. Security verification must cover report intake, triage
ownership, severity/SLA expectations, embargo handling, customer communication, and fix
verification.

## Scope In

- Public-at-GA and private-beta vulnerability intake channels.
- Severity labels with triage owners and SLA targets.
- Launch-blocker criteria that map to the v1 cutline and security verification gate.
- Embargo handling with authorized roles and audit evidence.
- Customer communication triggers and support handoff evidence.
- Fix verification evidence before a blocked release can proceed.
- Beta versus paid-GA differences.

## Scope Out

- No external bug bounty commitment unless separately approved.
- No final legal terms, privacy notices, security-page copy, or advisory text.
- No CVE CNA commitment or vendor-specific disclosure portal implementation.
- No live ticketing, support, incident, or customer-notification service.

## Intake

| Channel | Visibility | Owner | Evidence |
|---|---|---|---|
| `/.well-known/security.txt` | Public at paid GA | Security Verification | Published contact and encrypted-submission posture |
| Support security escalation | Private beta and GA | V1 Launch Support Desk & Escalation | Triage record and security-owner handoff |

Beta may use a private documented intake path before a public security page exists. Paid GA requires
a public security contact and supported reporting channel.

## Severity and SLA

| Severity | Triage SLA | Owner | Default launch posture |
|---|---:|---|---|
| Critical | 4 hours | Security lead | Blocks beta and paid GA until fixed or explicitly waived by launch owner |
| High | 24 hours | Security lead | Blocks launch when customer impact, exploitability, or unsupported claim risk exists |
| Medium | 72 hours | Security on-call | May ship as known limitation only when customer impact and exploitability are bounded |
| Low | 168 hours | Security on-call | Usually backlog or release-note item |

Every severity decision records affected phase, exploitability, customer impact, and whether the
fix is verified.

## Embargo

Embargoes are allowed only when the security lead, release owner, and legal/privacy owner agree.
The maximum default embargo is 90 days, recorded as `policy.Decided`. Embargo handling
does not relax the release blocker; it only controls disclosure timing.

## Customer Communication

Customer communication is required when impact is confirmed, a public advisory is required, a fix or
mitigation is available, or a known limitation is promoted into release notes. Evidence names the
audience, message owner, support playbook link, and publish/send timestamp.

## Fix Verification

Fix verification requires regression coverage, exploit reproduction, fix review, release-gate
rerun, and customer-impact assessment. A launch-blocking finding cannot move to a release
limitation until this evidence exists or an explicit launch-owner waiver is recorded.

## Launch-Blocker Criteria

The security verification gate and v1 cutline treat these as blockers:

- critical or high severity with public exploitability;
- confirmed customer data risk;
- a customer-facing security claim that lacks evidence;
- an unverified fix for a finding that affects beta or paid GA.

Each criterion maps to `v1-blocker.support` because the blocking outcome is a support/security
launch operation, even when legal/privacy, documentation, or productization owns part of the
evidence.

## Proof

The executable proof is
[`vulnerability-disclosure-launch-blocker-contract`](../../src/draft/vulnerability-disclosure-launch-blocker-contract/README.md).
It validates the process record, beta/GA differences, scope-out guard for external bug bounty, and
release-blocker classification.
