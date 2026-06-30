---
type: Reference
title: "Legal, Privacy, And Terms Launch Readiness"
description: "Source issue: HOBO-405."
tags: [hobo, design]
---

# Legal, Privacy, And Terms Launch Readiness

Source issue: HOBO-405.

Executable proof lives in
[`src/draft/legal-privacy-terms-readiness-contract`](../../src/draft/legal-privacy-terms-readiness-contract/README.md).
Branch evidence is summarized in
[`proofs/hobo-405-legal-privacy-terms-readiness`](./proofs/hobo-405-legal-privacy-terms-readiness/README.md).

## M0 Acceptance Record

HoBo v1 needs a launch-facing checklist that keeps public claims, support commitments, telemetry,
privacy posture, subprocessors, and legal unknowns aligned with evidence. This record defines the
checklist and its blockers without drafting final legal text or making public compliance claims.

## User And Business Goal

HoBo needs one legal/privacy/terms readiness surface that release, support, security, compliance,
and launch-communications owners can inspect before beta or GA. The checklist must show which items
are evidence-backed, which need owner input, which block launch, and which are explicit post-v1
follow-ups.

## Scope In

- Launch checklist for terms, privacy notice, data retention, telemetry,
  subprocessors/provider claims, security claims, support obligations, and customer communications.
- Owner, owning project, evidence source, customer-facing message, support action, audit evidence,
  and entitlement impact per checklist item.
- Legal/privacy unknowns classified as launch blockers or explicit post-v1 follow-ups.
- References to HoBo security, compliance/data governance, organizational governance, and scope
  records.

## Scope Out And Non-Goals

- Do not draft final customer terms, privacy policy, DPA, or legal policy text in this issue.
- Do not publish compliance, security, privacy, or provider claims without evidence.
- Do not implement a legal workflow, contract lifecycle system, billing policy, or support-desk
  product.
- Do not create downstream M1-M4 issues until this M0 checklist is accepted.

## Launch Checklist

| Domain | Owner | Owning project | Evidence source | Customer message | Support action | Audit evidence | Entitlement impact |
|---|---|---|---|---|---|---|---|
| Terms | legal owner | V1 Legal, Privacy & Terms Readiness | Legal owner approval plus release cutline signoff. | Terms are pending final legal approval; do not publish final terms from this M0 record. | Route terms questions to legal owner and release owner. | Signed launch checklist row and approval reference. | Blocks paid or public launch if final legal approval is absent. |
| Privacy notice | privacy owner | V1 Legal, Privacy & Terms Readiness | Privacy review over telemetry, retention, subprocessors, and support access. | Privacy notice must describe what HoBo collects, retains, exports, and shares before launch. | Escalate data-handling questions to privacy owner. | Privacy review reference and data map link. | Blocks launch for workflows that collect production customer data. |
| Data retention | governance owner | Compliance Evidence Pack | [Plan 46](./governance-planes.md#plan-46) classification, retention, erasure, and OCSF attestation model. | Retention commitments must distinguish product data, audit streams, telemetry, and support artifacts. | Route retention exceptions to governance owner. | Retention matrix and exported attestation evidence. | Controls whether customer data can enter beta or GA environments. |
| Telemetry | product analytics owner | Workspace & Onboarding UX | Workspace activation metrics and privacy-safe telemetry contract. | Telemetry must state purpose, PII exclusions, retention, opt-out behavior, and support/debug use. | Route telemetry opt-out and deletion requests to support owner. | Event catalog, retention policy, and opt-out handling evidence. | Beta telemetry can proceed only inside the reviewed privacy boundary. |
| Subprocessors/provider claims | vendor owner | Compliance Evidence Pack | Confirmed subprocessor/provider list and provider claim evidence. | Provider and subprocessor statements must distinguish required, optional, mocked, and unsupported services. | Escalate customer assurance requests to vendor owner. | Subprocessor list, provider claim register, and known limitations. | Blocks enterprise pilot commitments if required subprocessors are unconfirmed. |
| Security claims | security owner | Security Verification | [ADR-0023](./adr/02-identity-security.md#adr-0023) security posture, vulnerability process, SBOM/provenance, and launch-blocker gates. | Security claims must name implemented, simulated/reference, beta-only, and future-roadmap evidence. | Remove or downgrade unsupported public security claims. | Claim register row plus linked verification evidence. | Unsupported security claims cannot unlock customer-facing launch copy. |
| Support obligations | support owner | Support & Debug Tools | Support intake, severity, escalation, and debug evidence contract. | Support expectations must state response path, evidence needed, known limitations, and escalation triggers. | Route incidents through support intake with launch-blocker escalation. | Support runbook, severity table, and handoff evidence. | Defines beta and GA support boundaries without promising unowned SLAs. |
| Customer communications | launch communications owner | V1 Launch Site, Messaging & Demo Assets | Launch messaging claim register and release notes. | Customer-facing communications must align with evidence, known limitations, support boundaries, and release cutline. | Route unsupported or risky claims back to launch communications owner. | Claim register, release notes, and approval references. | Controls which claims can appear in beta, GA, docs, and demo assets. |

## Open Unknowns

| Unknown | Disposition | Owner | Required before |
|---|---|---|---|
| Final legal review for terms, privacy notice, and customer-facing legal copy | Launch blocker | legal owner | Public launch or paid GA |
| Confirmed v1 subprocessor/provider list | Launch blocker | vendor owner | Enterprise beta or GA customer assurance packet |
| Evidence review for public security claims | Launch blocker | security owner | Public security or compliance claims |
| Localized terms, translations, and jurisdiction-specific notices | Post-v1 follow-up | legal owner | Post-v1 expansion |
| Formal SOC2 or similar certification program | Post-v1 follow-up | compliance owner | Future certification program |

## Authoritative Dependencies

- [security-networking.md#plan-12](./security-networking.md#plan-12) defines the security posture,
  audit/compliance path, supply-chain posture, and supportable security boundaries.
- [governance-planes.md#plan-46](./governance-planes.md#plan-46) defines compliance/data
  governance, retention, erasure, attestation export, and AI-safety evidence boundaries.
- [ADR-0023](./adr/02-identity-security.md#adr-0023) requires security commitments to be verifiable
  gates, not prose.
- [ADR-0060](./adr/02-identity-security.md#adr-0060) keeps HoBo to evidence export rather than
  running a legal certification program.
- [ADR-0074](./adr/02-identity-security.md#adr-0074) defines organizational governance over HoBo's
  own control-plane actions.
- [ADR-0064](./adr/07-portability-extensibility.md#adr-0064) keeps commercial/legal business
  mechanics outside the HoBo meta-cloud implementation scope.

## Follow-Up Gate

M1/M2/M3/M4 legal, privacy, support, communications, or evidence work must wait until this M0
checklist is accepted. This branch records the checklist and its executable guard; it does not fan
out downstream work.

## M2 Private Beta Evidence Gate

HOBO-464 accepts private beta legal/privacy evidence only when the beta record stays narrower than
public launch or paid GA approval. The executable proof lives in
[`src/draft/legal-privacy-private-beta-evidence-contract`](../../src/draft/legal-privacy-private-beta-evidence-contract/README.md)
and branch evidence is summarized in
[`proofs/hobo-464-legal-privacy-private-beta`](./proofs/hobo-464-legal-privacy-private-beta/README.md).

Required M2 evidence:

- M0 checklist baseline remains accepted from
  [`legal-privacy-terms-readiness-contract`](../../src/draft/legal-privacy-terms-readiness-contract/README.md).
- Privacy notice beta review records telemetry purpose, retention posture, customer messaging, and
  beta limitations.
- Terms beta limitation records that private beta language is not public launch, paid GA, final DPA,
  or regional legal approval.
- Subprocessor/provider beta register distinguishes required, optional, mocked, unsupported, and
  unconfirmed services for beta.
- Data retention and telemetry boundaries consume the tenant data lifecycle record before customer
  data can enter beta workflows.
- Customer assurance and support handoff routes questions to named owners without inventing
  unsupported SLA or compliance promises.
- Legal risk register maps blockers, accepted risks, mitigations, launch notes, and revisit dates
  into the release cutline.

Blockers and accepted risks remain visible:

- Public paid launch remains blocked until final terms, privacy notice, DPA, and regional notice
  approval exist.
- Enterprise assurance remains limited until subprocessor/provider evidence is complete.
- Public security, privacy, compliance, provider, and paid-launch claims remain blocked unless the
  owning evidence surface accepts them.

Follow-up execution is allowed only for missing evidence. HOBO-471 owns release-candidate
legal/privacy signoff gaps, and HOBO-478 owns GA public legal/privacy signoff gaps. This gate does
not draft final legal text, implement a legal workflow, enable billing, approve support tooling, or
publish compliance claims.
