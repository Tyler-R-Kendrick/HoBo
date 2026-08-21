---
type: Plan
title: "anti-slop slice: runtime and conformance"
description: "File-complete anti-slop cleanup for @hobo/runtime and @hobo/conformance."
tags: [hobo, anti-slop, oxlint]
---

# runtime + conformance slice

Layer `sdlc/anti-slop-43-runtime-conformance`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/runtime packages/conformance` is clean. Package `tsc -p tsconfig.json --noEmit` is clean on both. Tests: `@hobo/runtime` 96 passed, `@hobo/conformance` 320 passed.

Local `src/json.ts` parse boundary in each package. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Generic parse helpers (`requireRecord`, `requireText`, `firstDiff`, `canonical`, `digest`) accept domain objects; JSON cloning happens at the document boundary via `cloneAsJson`. Handler/Trainable I/O stays generic and is stored erased (`as never`) at the router/registry edge.

Mechanical `unknown` → `JsonValue` rewrites that broke function-bearing providers and decorator `This` types were restored to generics.
