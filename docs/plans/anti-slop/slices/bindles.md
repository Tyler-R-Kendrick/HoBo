---
type: Plan
title: "anti-slop slice: @hobo/bindles"
description: "File-complete anti-slop cleanup for packages/bindles."
tags: [hobo, anti-slop, oxlint]
---

# bindles slice

Layer `sdlc/anti-slop-33-bindles`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/bindles` is clean. `@hobo/bindles` `tsc --noEmit` is clean. Package tests: 169 passed.

Local `src/json.ts` (`JsonValue` / `JsonObject` / `JsonBag` / `StringBag` / `isJson*` / `parseJson*` / `cloneAsJson`) is the parse boundary. Public parsers (`parseManifest`, `parseBindleRequirements`) are generic and clone at the JSON document edge so domain objects still typecheck. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. `BindleResourceShape` identifiers were renamed to `BindleResourceView`.
