---
type: Plan
title: "anti-slop slice: small runtimes"
description: "File-complete anti-slop cleanup for runtime-wasm, runtime-celld, and runtime-cloud-native."
tags: [hobo, anti-slop, oxlint]
---

# small runtimes slice

Layer `sdlc/anti-slop-39-runtimes-small`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/runtimes/runtime-wasm packages/runtimes/runtime-celld packages/runtimes/runtime-cloud-native` is clean. Each package `tsc --noEmit` is clean. Tests: wasm 46, celld 11, cloud-native 22 passed.

Each package has a local `src/json.ts` parse boundary. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement.
