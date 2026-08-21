---
type: Plan
title: "anti-slop slice: runtime-browser + runtime-oci"
description: "File-complete anti-slop cleanup for @hobo/runtime-browser and @hobo/runtime-oci."
tags: [hobo, anti-slop, oxlint]
---

# runtime-browser + runtime-oci slice

Layer `sdlc/anti-slop-40-runtimes-browser-oci`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/runtimes/runtime-browser packages/runtimes/runtime-oci` is clean. Each package `tsc --noEmit` is clean. Tests: browser 33, oci 36 passed.

Each package has a local `src/json.ts` parse boundary. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement.
