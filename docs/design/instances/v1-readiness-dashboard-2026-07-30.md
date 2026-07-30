---
type: Reference
title: "V1 readiness dashboard instance — 2026-07-30"
description: "First populated V1 readiness dashboard snapshot from the 2026-07-30 ship-readiness gap review. Honest red/yellow; not a go claim."
tags: [hobo, design, ship, instances, readiness]
---

# V1 readiness dashboard — 2026-07-30

> **Contract:** [`v1-readiness-dashboard.md`](../v1-readiness-dashboard.md)  
> **Ship targets:** [ADR-0140](../adr/07-portability-extensibility.md#adr-0140) / [`launch-ship-targets.md`](../launch-ship-targets.md)  
> **Source audit:** [`0011-ship-readiness-gap-review.md`](../../plans/0011-ship-readiness-gap-review.md) at `9d0233d2`  
> **Owner:** single maintainer (Tyler Kendrick) — all readiness roles unbound except as noted  
> **Not a ship decision.** See go/no-go instances for gate outcomes.

## Field status

| Field | Status | Value / evidence | Empty-state / fail-closed reading |
|---|---|---|---|
| **Cutline** | 🔴 Red | No ratified hosted v1 cutline instance. Interim ship cutlines defined by **ADR-0140** (A = S0/S1 hygiene; B = S1 offline; C = S2+ legal/dogfood/apply) but **not signed** as product GA boundary. Requirements suite unratified (0011 O6). | Missing cutline → cannot claim shared v1 product boundary. |
| **Blockers** | 🔴 Red | Open at audit: Actions runners not assigning (**V1**, human H-V1); S0 CI columns `TODO` (**V2**); no live customer ToS/privacy for C (**O2**); npm unpublished for B (**E1**); default IaC in-memory (**E2**); synthetic componentize (**E3**); no dogfood/pilot for C (**O4**). Full list: 0011 §6. | Unknown or open launch blockers → not ready for the affected target. |
| **Milestone health** | 🟡 Yellow | Design-intent register [`GAPS.md`](../../../GAPS.md) closed (design alignment only). Engineering scale real (~58 package manifests, composed CLI). Productization M0 contracts exist; **M3/M4 hosted evidence not claimed**. Production stages: S0 ~60–75%, S1 ~75–90% local, S2+ incomplete (0011 §4). No Linear milestone refresh attached to this instance. | Missing live milestone refresh → yellow; owner must refresh before a hard go. |
| **Evidence links** | 🔴 Red | Local/design evidence strong; **CI as release oracle broken** (jobs ~3s, `runner: None`). S0 acceptance CI cells `TODO`. Last successful scheduled `HoBo CI Fabric` on `main` recorded in audit as **2026-06-29** — **not** re-verified green here. Stage docs: [`build-s0-stage-gate-acceptance.md`](../build-s0-stage-gate-acceptance.md), [`build-s1-stage-gate-acceptance.md`](../build-s1-stage-gate-acceptance.md). | Missing CI/proof links → red; do not render green. |
| **Accepted risks** | 🟡 Yellow | Register opened: [`accepted-risks-2026-07-30.md`](./accepted-risks-2026-07-30.md) (single maintainer, CI outage, synthetic wasm, in-memory default). Risks **recorded**, not cleared. | Neutral would mean “none on file”; here risks are on file and still live. |
| **Owners** | 🔴 Red | All release/security/legal/support/business roles effectively **single maintainer (Tyler Kendrick)**. Bus factor unrecorded until this instance + accepted-risks (0011 O8). No separate counsel or staffed support owner for Target C. | Unowned lanes → red for multi-role gates (especially C). |
| **Last verified** | 🔴 Red | Dashboard instance authored **2026-07-30** from audit at `9d0233d2`. **No claim that full `check:all` or Actions is green on this date.** Secret history scan still required before Target A go (0011 §9). | Never CI-verified on current main → red for CI-proven claims. |

## Per-target readiness (rollup)

| Target | Rollup | Notes |
|---|---|---|
| **A — OSS public** | 🟡 Conditional path | Near; blocked on hygiene decisions + secret scan. CI restore should, not must, for “repo public”. Instance: [`go-no-go-repo-public-2026-07-30.md`](./go-no-go-repo-public-2026-07-30.md). |
| **B — Developer tooling** | 🔴 No-go / conditional | npm not published; dual-bin and immature `publishConfig` risk; honesty pass required. Instance: [`go-no-go-developer-tooling-2026-07-30.md`](./go-no-go-developer-tooling-2026-07-30.md). |
| **C — Hosted beta/GA** | 🔴 No-go | Legal, dogfood, real apply, staffed support all open. No beta/RC/GA instance filed. |

## Explicit non-claims

- CI is **not** green on this dashboard.
- npm packages are **not** published.
- Default `hobo up` is **not** real multi-cloud apply.
- `@hobo/componentize` path remains **synthetic contract-shaped wasm** unless later evidence says otherwise.
- This dashboard does **not** approve Target C.

## Revisit

| Item | Date |
|---|---|
| Re-run dashboard after secret scan + CI runner restoration | 2026-08-30 or next ship review, whichever first |
| Refresh after WP-B–E remediation lands | with PR that closes those packages |
