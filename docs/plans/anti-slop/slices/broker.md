---
type: Plan
title: "anti-slop slice: @hobo/broker"
description: "File-complete anti-slop cleanup for packages/broker."
tags: [hobo, anti-slop, oxlint]
---

# broker slice

Layer `sdlc/anti-slop-31-broker`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/broker` is clean. `@hobo/broker` `tsc --noEmit` is clean.

Local `src/json.ts` (`JsonValue` / `JsonObject` / `JsonBag` / `isJson*` / `parseJson*` / `cloneAsJson`) is the parse boundary. Yard/camp matching identifiers use `layout` rather than `shape`. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement.

`parseEventEnvelope` / `parseEventPosition` / `parseFenceToken` in `@hobo/core` accept domain values and clone at the JSON boundary so dependents such as `@hobo/storage-sqlite` keep compiling.
