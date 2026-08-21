---
type: Plan
title: "anti-slop slice: draft epic-proofs"
description: "File-complete anti-slop cleanup for src/draft/epic-proofs."
tags: [hobo, anti-slop, oxlint]
---

# draft epic-proofs slice

Layer `sdlc/anti-slop-47-draft-epic`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern src/draft/epic-proofs` is clean.

Local `src/json.ts` parse boundary in packages that parse JSON or inspect values. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Named fold generics replace `unknown` actor fold state. Empty object spreads and `typeof` type-guards were rewritten to `undefined` spreads and `isJson*` helpers.

Sample package tests: s1-10 13, s2 11, contracts-policy 7, finops 13, gated-live-fix-loop 7, identity 6, mapping-styles 8, stage-6 11, stage-gate-s3 7, cli-mcp 7, governance-planes 10, portability 5, wit 7, networking 6, control-plane 6.
