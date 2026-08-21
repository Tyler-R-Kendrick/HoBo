---
type: Plan
title: "anti-slop slice: runtime-dapr + runtime-rivet"
description: "File-complete anti-slop cleanup for @hobo/runtime-dapr and @hobo/runtime-rivet."
tags: [hobo, anti-slop, oxlint]
---

# runtime-dapr + runtime-rivet slice

Layer `sdlc/anti-slop-41-runtimes-dapr-rivet`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/runtimes/runtime-dapr packages/runtimes/runtime-rivet` is clean. Each package `tsc --noEmit` is clean. Tests: dapr 14, rivet 15 passed.

Each package has a local `src/json.ts` parse boundary. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Public parse helpers are generic (`parseDaprRuntimeConfig<T>`, `parseDaprComponentSpec<T>`, `parseRivetRuntimeConfig<T>`) and clone through JSON before refining. Rivet journal rows use a named `SqliteRow` (blob-capable) instead of `JsonObject`.
