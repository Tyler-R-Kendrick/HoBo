---
type: Plan
title: "anti-slop slice: eval promotion, overlay mesh, dispatcher credits"
description: "File-complete anti-slop cleanup for eval-promotion-gate-contract, tier-four-overlay-mesh-contract, and dispatcher-maximize-credits-contract."
tags: [hobo, anti-slop, oxlint]
---

# eval promotion + overlay mesh + dispatcher credits slice

Layer `sdlc/anti-slop-70-draft-eval-overlay-dispatcher`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `eval-promotion-gate-contract`, `tier-four-overlay-mesh-contract`, and `dispatcher-maximize-credits-contract` is clean.

Local `src/json.ts` parse boundary. Tests: eval 4; overlay 11; dispatcher 14.
