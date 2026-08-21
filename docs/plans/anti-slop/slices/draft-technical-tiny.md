---
type: Plan
title: "anti-slop slice: tiny technical proofs"
description: "File-complete anti-slop cleanup for 122 technical-proof packages with 1–3 findings."
tags: [hobo, anti-slop, oxlint]
---

# tiny technical-proofs slice

Layer `sdlc/anti-slop-48-draft-technical-tiny`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` over the 122 packages that had 1–3 findings is clean.

Local `src/json.ts` parse boundary where `typeof` guards were rewritten. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Named return contracts replace anonymous widening. Empty object spreads use `undefined`.
