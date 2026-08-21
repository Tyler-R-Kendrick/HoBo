---
type: Plan
title: "anti-slop slice: provider-kubernetes"
description: "File-complete anti-slop cleanup for @hobo/provider-kubernetes."
tags: [hobo, anti-slop, oxlint]
---

# provider-kubernetes slice

Layer `sdlc/anti-slop-46-provider-kubernetes`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/providers/provider-kubernetes` is clean. Package `tsc -p tsconfig.json --noEmit` is clean. Tests: 214 passed.

Local `src/json.ts` parse boundary. Named maps replace `Record<string, T>`. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Yard instance documents clone through `asJsonObject`.
