---
type: Implementation Plan
title: "Proof-hardening backfill waves"
description: "Linear-ready waves that bring the 647 grandfathered draft proofs up to the hardened artifact standard, sized for sdlc implementer-subagent dispatch."
tags: [hobo, plans]
---

# Proof-hardening backfill waves

> The hardening baseline (classification manifest → exp-proofs reorg → `proof.json` gates →
> sdlc loop, PR #638) grandfathered the **647 existing packages** in
> [`src/draft/_grandfathered.json`](../../src/draft/_grandfathered.json): they receive advisory
> warnings from `pnpm run draft:artifacts` until their backfill wave lands and **deletes their
> allowlist entry**. This document stages those waves for Linear import (paced single-writer, per
> the runbook pattern in [`production-build-backlog.md`](production-build-backlog.md)) under a
> "Proof Hardening Backfill" project. The **sdlc** skill dispatches them to implementer subagents.

## Wave structure

Waves are dependency-ordered; issues within a wave are independent (parallelizable) batches of
~15–20 packages each. Every issue follows the one-shot contract
(`.claude/skills/sdlc/references/linear-planning.md`) with this wave-specific core:

- **Acceptance (every batch issue):** for each package in the batch — required artifacts present
  and honest; its entry **deleted** from `src/draft/_grandfathered.json`;
  `pnpm run draft:artifacts -- --staged` green (no advisories for the package);
  `pnpm run draft:cascade -- --staged` green; `pnpm agent:check -- --staged` green.
  Before the allowlist entry is deleted, a package can be verified strictly with the gate's
  direct mode: `tsx scripts/check-draft-artifacts.ts <workspace-path>` (positional paths skip
  the git diff and enforce even while grandfathered — examples are executed and diffed).
- **Guardrails:** scaffold shapes from `src/draft/_templates/<layer>/`; waivers (proof.json + ADR)
  are sanctioned where an artifact is genuinely N/A — fabricated filler is a review failure
  (the reviewer subagent audits honesty, not just presence).

| Wave | Scope | Batches (≈) | Deliverable per package |
|---|---|---|---|
| **W1 proof.json bootstrap** | all 647 grandfathered packages | 30 | `proof.json` with honest `references` graph (imports + ledger rows), layer/type fields, declared existing artifacts, waivers for the not-yet-backfilled ones. This unlocks manifest-derived traceability and precise cascade checking. |
| **W2 executable epic features** | 25 epics with prose-only Gherkin | 4 | Promote README/`gherkin:` arrays into `features/*.feature` + `features/steps/*.ts` running green under `pnpm run test:behavior` (pattern: the finops epic). |
| **W3 examples + notebooks** | all layers | 30 | `examples/<name>.ts` + `<name>.expected.txt` (gate-executed) demonstrating the package's real contract; executed tslab `notebook.ipynb` walkthrough. |
| **W4 ux visual assets** | 37 ux proofs | 7 | `assets/` with real SVG/PNG wireframes/mockups/screenshots replacing TypeScript "mockup modules" as the visual evidence (modules stay as fixtures). |
| **W5 per-type exp artifacts** | dx/cx/ax/api proofs | 12 | dx: proto+CUE+mermaid complete · cx: journey maps/scripts · ax: MCP transcripts/tool schemas · api: type tests + example consumers. |
| **W6 technical benches** | 457 technical proofs | 20 | `bench/*.bench.ts` (vitest bench) + committed `baseline.json` for measurable hot paths; ADR-backed waiver where genuinely N/A (docs-only contract fixtures). |

Dependencies: W2–W6 assume W1's manifest exists for their packages (W1 batches can interleave —
a later wave's batch may run once ITS packages have manifests). W4/W5 batches should group by
experience type so one implementer holds one artifact discipline.

## Linear import (when MCP access is approved)

1. Project **"Proof Hardening Backfill"** (team HoBo, label `production-build` + `slice`),
   milestones = waves W1–W6.
2. One issue per batch, titled `W<N>: <layer/type> batch <i> — <first-slug>..<last-slug>`, body =
   one-shot contract + the explicit package list + the wave's acceptance block above.
3. Batch package lists derive mechanically from `src/draft/_grandfathered.json` (split per wave
   scope, sorted, chunked); generate at import time so the lists reflect entries already deleted
   by earlier landed batches.

## Progress accounting

`src/draft/_grandfathered.json` IS the burn-down: 647 → 0. No entry may be added; every wave
issue deletes its batch's entries. When the file's `packages` array is empty, the advisory tier
disappears and the full gate applies repo-wide — that event closes the backfill epic.

### Snapshot (2026-07-30)

| Wave | Status |
|---|---|
| **W1 proof.json** | **Done for remaining grandfathered set** — every entry in `_grandfathered.json` carries a schema-valid `proof.json` (619 → 618 after first W3 un-grandfather). |
| **W2 epic features** | Partial historically (28 `.feature` files); not closed. |
| **W3 examples+notebooks** | **Started** — first package fully hardened & removed from allowlist: `dispatcher-reservation-hardening-contract` (executed example + notebook + bench). |
| **W4–W6** | Not started at scale. |

Burn-down: **618** grandfathered packages remain.
