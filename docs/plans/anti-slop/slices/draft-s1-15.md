---
type: Plan
title: "anti-slop slice: s1-15 bind wiring topology"
description: "File-complete anti-slop cleanup for s1-15-bind-wiring-topology-contract."
tags: [hobo, anti-slop, oxlint]
---

# s1-15 bind-wiring-topology slice

Layer `sdlc/anti-slop-51-draft-s1-15`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern src/draft/technical-proofs/s1-15-bind-wiring-topology-contract` is clean.

Local `src/json.ts` parse boundary. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Named return contracts replace anonymous widening. Tests: 23 passed.
