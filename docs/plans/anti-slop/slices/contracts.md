---
type: Plan
title: "anti-slop slice: @hobo/contracts"
description: "File-complete anti-slop cleanup for packages/contracts."
tags: [hobo, anti-slop, oxlint]
---

# contracts slice

Layer `sdlc/anti-slop-34-contracts`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/contracts` is clean. `@hobo/contracts` `tsc --noEmit` is clean. Package tests: 39 passed.

Local `src/json.ts` is the parse boundary. Domain parsers (`parseBoundaryContract`, `parseEffectSpec`, `parseResilienceProfile`) are generic and clone at the JSON document edge. `RequiredShape` / `requiredShape` identifiers were renamed to `RequiredLayout` / `requiredLayout` (wire proto message stays `RequiredShape`). Remaining `as` assertions carry a `SAFETY:` comment on the containing statement.
