# ADR-0018 — Requirements-artifact structure & traceability scheme

- **Status:** Accepted
- **Date:** 2026-06-20
- **Deciders:** Product, Engineering, Platform
- **Related:** [Requirements suite](../../requirements/README.md) · [BRD](../../requirements/BRD.md) · [PRD](../../requirements/PRD.md) · [TRD](../../requirements/TRD.md) · [README index](../README.md)

## Context
HoBo's design suite (`docs/design/0–30`) is engineering-shaped: it explains *how* the system works but does not expose the **requirements layer** that business, product, and platform stakeholders sign off on. We need formal Business / Product / Technical requirements that are **mutually consistent** and **traceable**, without duplicating or forking the design docs (which remain the source of design truth). The risk of three free-standing documents is drift: a business goal with no product feature, a feature with no technical owner, an NFR no one verifies.

## Decision
1. **Three documents, one folder.** `docs/requirements/` holds `BRD.md` (why/business), `PRD.md` (what/product), `TRD.md` (how/technical, in requirements terms), plus a `README.md` index. They **cite** `docs/design/*` rather than restating it.
2. **Stable requirement IDs.** Each requirement gets a typed, immutable ID:
   - `BR-NNN` — business requirement (BRD)
   - `FR-NNN` — functional requirement (PRD)
   - `NFR-NNN` — non-functional requirement (PRD)
   - `TR-NNN` — technical requirement (TRD)
3. **Forward traceability is mandatory.** Every `BR` maps to ≥1 `FR`/`NFR`; every `FR`/`NFR` maps to ≥1 `TR`; every `TR` cites the design doc(s) and (where relevant) the conformance/verification that proves it. The TRD owns the authoritative **BR→FR/NFR→TR traceability matrix**.
4. **Priority vocabulary** is MoSCoW (`Must`/`Should`/`Could`), expressing **build priority/order within the single v1** — all requirements are v1, mapped to the build stages in the [per-stage build detail](../08-roadmap.md#per-stage-build-detail-stages-06) (see [ADR-0063](./ADR-0063-single-v1-scope.md), superseding the former ADR-0022 MVP-scope line; there is no `Won't`-for-v1 tier).
5. **Style** is "formal but skimmable": standard enterprise section set (document control, RACI, sign-off, risk register) rendered as tables/short prose to match the suite's voice.

## Alternatives considered
- **Numbered design docs (`31/32/33`)** — rejected: requirements are a different artifact class with a different audience and review cadence than design plans; mixing them muddies both.
- **A single combined PRD/BRD/TRD** — rejected: the three audiences and sign-off owners differ; separation enables independent approval.
- **No formal IDs** — rejected: traceability and review depend on stable identifiers.

## Consequences
- **(+)** Coverage gaps become visible (an orphan `BR` or an unverified `NFR` is a defect). Reviews and audits can target IDs.
- **(+)** Design docs stay the single source of design truth; requirement docs stay thin and reference-driven.
- **(−)** The traceability matrix is maintenance that must be kept current as design docs evolve; stale IDs are a real failure mode. Mitigation: the matrix lives only in the TRD (one place), and the link/coverage check is part of doc verification.
