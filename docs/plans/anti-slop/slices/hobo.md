---
type: Plan
title: "anti-slop slice: @hobo/hobo"
description: "File-complete anti-slop cleanup for packages/hobo."
tags: [hobo, anti-slop, oxlint]
---

# hobo slice

Layer `sdlc/anti-slop-29-hobo`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/hobo` is clean. `@hobo/hobo` `tsc --noEmit` is clean.

Local `src/json.ts` (`JsonValue` / `JsonObject` / `isJson*` / `parseJson*` / `cloneAsJson`) is the parse boundary. Empty-object spreads use `undefined`. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement.
