---
type: Plan
title: "anti-slop slice: runtime-local"
description: "File-complete anti-slop cleanup for @hobo/runtime-local."
tags: [hobo, anti-slop, oxlint]
---

# runtime-local slice

Layer `sdlc/anti-slop-42-runtimes-local`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/runtimes/runtime-local` is clean. Package `tsc --noEmit` is clean. Tests: 70 unit + 3 contract passed.

Local `src/json.ts` parse boundary. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Public parse helpers (`parseAppendContext`, `parseEventInput`) are generic and accept domain objects without JSON-stringifying bigint fence tokens.

Cascade tsc fix so `@hobo/runtime-local` turbo tests can build: `@hobo/runtime` (`placement.ts`, `training.ts`, `workflow.ts`, `agent.ts`) and `@hobo/conformance` (`realization-result.ts`) plus per-package `json.ts`. Those files are oxlint `--deny-warnings` clean.
