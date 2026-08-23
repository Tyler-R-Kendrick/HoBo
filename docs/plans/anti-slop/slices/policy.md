---
type: Plan
title: "anti-slop slice: @hobo/policy"
description: "File-complete anti-slop cleanup for packages/policy."
tags: [hobo, anti-slop, oxlint]
---

# policy slice

Layer `sdlc/anti-slop-37-policy`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/policy` is clean. `@hobo/policy` `tsc --noEmit` is clean. Package tests: 34 passed.

Local `src/json.ts` is the parse boundary. `toWitDecisionRecord` / `createPolicyDecidedEvent` are generic. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement.
