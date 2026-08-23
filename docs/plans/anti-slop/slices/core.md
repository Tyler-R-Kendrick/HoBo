---
type: Plan
title: "anti-slop slice: @hobo/core"
description: "File-complete anti-slop cleanup for packages/core."
tags: [hobo, anti-slop, oxlint]
---

# core slice

Layer `sdlc/anti-slop-30-core`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/core` is clean. `@hobo/core` `tsc --noEmit` is clean.

Local `src/json.ts` (`JsonValue` / `JsonObject` / `JsonBag` / `isJson*` / `parseJson*` / `cloneAsJson`) is the parse boundary. Parse-error `received` values are `JsonValue | undefined`. Empty-object spreads use `undefined`. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Generated `_generated/` files are untouched.
