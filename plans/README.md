# Review findings — HoBo requirements suite (security · ease-of-use · portability)

> Output of the `/improve` audit (three fresh-context lens reviewers + a mechanical traceability check) **reconciled with the GitHub PR #1 review** (Copilot, 7 comments). Audited against commit `b3cf64d`. Scope: `docs/requirements/{BRD,PRD,TRD,README}.md` + `docs/design/adr/ADR-0018..0022`, cross-checked vs `docs/design/`. This repo is docs-only — findings are documentation/requirements gaps, not code bugs.
>
> **Status key:** ✅ resolved in the hardening pass (commit after `b3cf64d`) · ⏳ deferred (needs user decision) · ❎ rejected (not a real issue).

## How findings were resolved
The hardening pass added **[ADR-0023 (security posture)](../docs/design/adr/ADR-0023-security-posture-commitments.md)** and **[ADR-0024 (portability conformance guarantee)](../docs/design/adr/ADR-0024-portability-conformance-guarantee.md)**, plus new `NFR-017..020`, `FR-014`, and `TR-006/013/053/071/083` and tightened `TR-051/110/111/112`, and fixed the traceability matrix. See the PR description for the full hardening log.

## Security lens (reviewer SEC)
| ID | Finding | Sev | Status |
|---|---|---|---|
| SEC-01 | Audit-retention floor unquantified ("per compliance policy") | MED | ✅ NFR-018 + TR-052 retention floor |
| SEC-02 | Legacy static API-key escape hatch has no TTL/rotation requirement | MED | ✅ ADR-0023 + tightened TR-051 (TTL+rotation+audited) + NFR-005 |
| SEC-03 | Per-run encryption decryption authz unspecified | MED | ✅ TR-111 (decrypt requires log-read AND explicit authz) |
| SEC-04 | Forge prompt-injection (source docs) named in design, not a requirement | MED | ✅ TR-083 (sanitize + provenance scrub report) |
| SEC-05 | No rate-limiting / DoS protection for Gateway/MCP | MED | ✅ NFR-019 + TR-071 |
| SEC-06 | SBOM scope + severity threshold + format vague | MED | ✅ tightened TR-112 (CycloneDX, CVSS≥7 gate, all artifacts) |
| SEC-07 | Wasm cross-tenant capability-denial test under-specified | MED | ✅ TR-110 (explicit cross-tenant denial scenario) |
| SEC-08 | Encryption-at-rest not required across all Worlds | MED | ✅ TR-111 (envelope encryption across Worlds) |
| SEC-09 | Confused-deputy (cross-tenant token) gate not explicit | LOW | ✅ TR-053 (default-deny cross-tenant token issuance) |
| SEC-10 | Security verification methods reference design docs, not concrete specs | HIGH | ✅ tightened verification columns; ADR-0023 names test scenarios (full per-TR test-spec doc deferred to build phase) |

## Portability lens (reviewer PORTABILITY)
| ID | Finding | Sev | Status |
|---|---|---|---|
| P-01 | "Unedited" Bindle is narrative, not formally defined | LOW(lev HIGH) | ✅ ADR-0024 + TRD §5.1 definition (bindle.ts+src byte-identical; only config/env vary) |
| P-02 | Agnostic-core layering invariant has no enforced lint requirement | HIGH | ✅ TR-006 (CI dep-graph gate) + NFR-020 |
| P-03 | Worlds portability not proven across ≥2 Worlds in E2E | MED | ✅ TR-012 verification adds ≥2-World E2E |
| P-04 | No lock-in detection for `.with()` / static-key drift | MED | ✅ FR-014 (`hobo doctor` portability+security lint) |
| P-05 | World/WIT versioning policy open (Q11) | HIGH | ✅ TR-013 v1 stance (pin in manifest IR; gated upgrade); ADR-P/Q11 still tracked |
| P-06 | Self-host vs hosted feature-parity not defined as a requirement | MED | ✅ ADR-0024 + NFR-013 parity clause |
| P-07 | Upstream-churn isolation is prose, no mechanism requirement | HIGH | ✅ TR-013 (pin Pulumi/WIT/MCP + compat/upgrade-test gate) |

## Ease-of-use / traceability lens (reviewer EOU + mechanical check)
| ID | Finding | Sev | Status |
|---|---|---|---|
| EOU-1/3/8 | NFR-016 (accessibility/i18n) weak AC + wrong BR mapping + absent from matrix | HIGH | ✅ rewritten NFR-016 (measurable AC; mapped to BR-001; in matrix) |
| EOU-2 | `explain-failure`/`fix` FR has no error-UX requirement | MED | ✅ NFR-017 (actionable errors) + FR-013 AC |
| MECH-1 | **FR-031 defined but missing from traceability matrix** (orphan; EOU agent missed) | MED | ✅ FR-031 added to matrix (BR-004/BR-008) |
| EOU-4 | FR-052 conflates auditability vs governance | LOW | ✅ AC clarified |
| EOU-9 | Platform-eng readiness ambiguous between P5/P6 | LOW | ✅ narrative clarified |
| EOU-misc | Consistency/sign-off/ADR-status | N/A | ❎ no issue (verified clean) |
| MECH-2 | "dangling FR-007/008/009/014/015" | — | ❎ false positive (regex matched substrings of NFR-007 etc.) |

## PR review (Copilot, PR #1)
| ID | Finding | Status |
|---|---|---|
| C-01 | `docs/design/README.md` "no implementation code" stale (agent-tooling `.py` exists) | ✅ clarified to "no HoBo *product* code" |
| C-02 | `README.md` same stale claim | ✅ clarified |
| C-03 | `CLAUDE.md` same stale claim | ✅ clarified |
| C-04 | `README.md` "20 plans" but 31 exist (00–30) | ✅ corrected to 31 |
| C-05 | `.mcp.json` auto-discovers `gbrain` (third-party egress once keyed) — make opt-in | ⏳ deferred — reverses an explicit prior user decision; asked the user |
| C-06 | `competitors/shoo/server-verification.md` "Verbatim" copyright risk | ⏳ deferred — flagged to user (broad, pre-existing, debatable fair-use) |
| C-07 | `competitors/shoo/convex-integration.md` "Verbatim" copyright risk | ⏳ deferred — same as C-06 |

## Net
The suite was structurally sound (traceability, consistency, ADR hygiene all near-clean). The review's value was in **defensive requirements that were assumed but not stated** — the mechanisms that keep the security and portability promises from silently eroding (lint gates, version pinning, rate-limits, bounded escape hatches, audit retention, accessibility). Those are now first-class `NFR`/`TR` with verification, anchored by ADR-0023/0024.
