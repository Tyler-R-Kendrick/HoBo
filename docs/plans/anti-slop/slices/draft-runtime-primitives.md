---
type: Plan
title: "anti-slop slice: runtime primitives and multi-region DR"
description: "File-complete anti-slop cleanup for hobo-runtime-ts-primitives and multi-region-dr-replay-contract."
tags: [hobo, anti-slop, oxlint]
---

# runtime primitives + multi-region DR slice

Layer `sdlc/anti-slop-52-draft-runtime-primitives`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `hobo-runtime-ts-primitives` and `multi-region-dr-replay-contract` is clean.

Local `src/json.ts` parse boundary. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Actor definitions are stored erased (`as never`) at the registry edge. Tests: runtime-ts-primitives 12, multi-region-dr-replay 12.
