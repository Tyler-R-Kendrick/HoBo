---
type: Plan
title: "anti-slop slice: @hobo/connectivity"
description: "File-complete anti-slop cleanup for packages/connectivity."
tags: [hobo, anti-slop, oxlint]
---

# connectivity slice

Layer `sdlc/anti-slop-32-connectivity`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/connectivity` is clean. `@hobo/connectivity` `tsc --noEmit` is clean.

Local `src/json.ts` (`JsonValue` / `JsonObject` / `JsonBag` / `StringBag` / `isJson*` / `parseJson*` / `cloneAsJson`) is the parse boundary. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement.
