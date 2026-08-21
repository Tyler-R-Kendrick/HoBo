---
type: Plan
title: "anti-slop slice: @hobo/dispatcher"
description: "File-complete anti-slop cleanup for packages/dispatcher."
tags: [hobo, anti-slop, oxlint]
---

# dispatcher slice

Layer `sdlc/anti-slop-38-dispatcher`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/dispatcher` is clean. `@hobo/dispatcher` `tsc --noEmit` is clean. Package tests: 73 passed.

Local `src/json.ts` is the parse boundary. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement.
