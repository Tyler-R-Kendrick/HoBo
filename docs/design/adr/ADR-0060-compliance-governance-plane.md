# ADR-0060 — Compliance & data governance as a plane over the existing planes

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product, Security
- **Related:** [Plan 46 — Compliance & data governance](../46-compliance-governance.md) · [Plan 30 — Policy plane](../30-policy-plane.md) (obligations; `dataClassifications`/`region` context) · [Plan 29 — Contracts/`can-deploy`](../29-contracts-compatibility.md) · [ADR-0040 — Cross-Camp consistency](./ADR-0040-cross-camp-stateful-consistency.md) (residency) · [ADR-0036 — Air-gapped/sovereign](./ADR-0036-air-gapped-sovereign-mode.md) · [ADR-0023 — Security posture](./ADR-0023-security-posture-commitments.md) (retention floor) · [ADR-0046 — Boundary standards](./ADR-0046-boundary-standards-cloudevents-ocsf-otlp.md) (OCSF audit) · [Plan 11 — Event model](../11-event-model.md) (forward-only log; `data.Classified`/`governance.*`/`erasure.*`) · [Plan 39 — Data plane](../39-data-plane-projections.md) (projection rebuild) · [ADR-0051](./ADR-0051-wit-record-canonical-domain-schema.md) (field-level labels) · [Plan 21](../21-resources-catalog.md)/[Plan 31](../31-config-secretless-secrets.md) (`hobo:crypto`)
- **Origin:** a coverage sweep found residency was only a *hint*, retention only a *floor*, audit export present — but no plane turning a classification into enforcement, no erasure mechanism, and no attestation output.

## Context
HoBo had the raw materials of compliance (audit log, OCSF export, residency hints, a retention floor, `hobo:crypto`, the policy plane) but not the plane that composes them into **enforced** governance. Regulated buyers need: data placed where law requires, deleted on request, retained for the right window, and **provable** via attestations. Doing this per-app or per-cloud would be inconsistent and unauditable.

## Decision
1. **Classification is the keystone.** Resources and WIT-record fields carry classification labels ([ADR-0051](./ADR-0051-wit-record-canonical-domain-schema.md)); `data.Classified` feeds the policy plane's existing `dataClassifications`/`region` context ([Plan 30](../30-policy-plane.md)).
2. **Residency + retention are enforced as policy obligations** at **`can-deploy`** ([Plan 29](../29-contracts-compatibility.md)) *and* runtime — reusing Matching region context ([ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md)), cross-Camp residency ([ADR-0040](./ADR-0040-cross-camp-stateful-consistency.md)), and sovereign mode ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)) as the ceiling. Misplacement is a gate failure, not a runtime surprise.
3. **Right-to-erasure = crypto-shredding + projection purge, never history rewrite.** PII is encrypted per-subject via `hobo:crypto`; erasure destroys the key + writes a tombstone (`erasure.Requested/Completed`) and rebuilds projections excluding the subject ([Plan 39](../39-data-plane-projections.md)). The forward-only log invariant ([Plan 11](../11-event-model.md)) is preserved.
4. **Attestation bundles are assembled from the log** — SOC2/GDPR/HIPAA evidence is a signed projection over audit/OCSF + `policy.Decided` + `data.Classified`/`erasure.*`, produced by `hobo attest`; frameworks are declarative control→evidence packs.
5. **A subprocessor/DPA registry** is authoritative for who-processes-what-where; routing classified data to an unregistered/disallowed subprocessor fails `can-deploy`.

## Alternatives considered
- **Mutable/erasable event log (delete the user's events).** Rejected: destroys replay, audit, and time-travel — the core bet. Crypto-shredding gives deletion semantics without breaking the invariant.
- **Hand-maintained compliance spreadsheets / external GRC only.** Rejected as the source of truth: evidence drifts from reality. HoBo *generates* the evidence from facts and can still export to GRC tools.
- **Residency as advisory metadata.** Rejected: regulated data placement must *block* a non-compliant plan; advisory hints already existed and were insufficient.
- **Per-app bespoke compliance.** Rejected: inconsistent and unauditable across a multi-cloud estate; governance belongs in a plane.

## Consequences
- **(+)** Turns scattered hints into enforced, provable governance with little new machinery — classification + obligations + crypto-shred + an evidence projection, all on existing planes.
- **(+)** Erasure that respects the immutable log is a genuinely hard problem solved coherently; attestations-from-the-log make audits cheaper and continuously fresh.
- **(+)** Strengthens the regulated-buyer / sovereign story already started by ADR-0036/0040.
- **(−)** Crypto-shredding requires disciplined per-subject key management and that PII actually be encrypted under those keys (a classification + codegen obligation); a mis-scoped key boundary widens erasure blast radius — an iteration hook.
- **(−)** Attestation packs encode an interpretation of each framework's controls; they are evidence assembly, **not** a legal certification — that still requires an auditor. HoBo makes the evidence, not the opinion.
