---
type: Reference
title: "optimizexp-cli-overhaul initiative state"
description: "Durable loop state for the optimizexp CLI-experience overhaul + boyscout sweep."
tags: [hobo, plans, sdlc, optimizexp, cli, dx, ax]
---

# Initiative: optimizexp CLI-experience overhaul + boyscout sweep

**Phase:** closeout  
**Slug:** `optimizexp-cli-overhaul`  
**Opened:** 2026-07-31  
**Host:** kimi  

## Goal

Make the optimizexp skill actually capable of finding poor hobo/hobo-code CLI
experiences (falsifiable scoring, v2 personas, product-CLI feature coverage,
drift gate), fix the CLI defects the audit surfaced, and boyscout every
pre-existing failure / real bug / debt item discovered along the way.

## Decisions

- Keep the skill's harness/state machine (sound); fix sensors + scoring
  falsifiability + CI drift gates instead of rewriting.
- Backend: **sequential-fallback / subagent fan-out** (coordinator delivered
  via parallel coder subagents; no Linear CLI).
- Legacy bus entries archived (not backfilled) — backfill would fabricate the
  evidence the contract exists to prove.
- `architecture:guard:all` debt on origin/main fixed with real minimal
  artifacts rather than waivers.
- Delivery: single PR (sequential work, no dependent layers left open).
  Old branch `docs/optimizexp-hobo-code-shell-closeout` left untouched (its
  only commit was already on trunk; rebase would have needed force-push).

## Delivered PRs

| PR | Title | Result | Notes |
|---|---|---|---|
| [#999](https://github.com/Tyler-R-Kendrick/HoBo/pull/999) | feat(optimizexp): CLI experience overhaul + boyscout sweep | open → closeout | 2 commits: optimizexp initiative, boyscout sweep |

## Validation ledger

- `pnpm run check:all` exit 0 (16 gates; test:unit 736 files/4585 tests;
  behavior 98/98).
- Turbo full sweep 769/769; contract consumer 604/604, provider 200/200.
- `optimizexp:check` OK; planted-bad-entry hard-fail proof for bus + personas.
- `agent:check -- --staged` green before both commits.
- cucumber cli-product: 31 scenarios / 247 steps green.
