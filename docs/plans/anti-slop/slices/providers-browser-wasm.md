---
type: Plan
title: "anti-slop slice: browser-wasm"
description: "File-complete anti-slop cleanup for provider-browser-wasm."
tags: [hobo, anti-slop, oxlint, providers]
---

# browser-wasm slice

Layer `sdlc/anti-slop-17-providers-browser-wasm`.

`@hobo/provider-browser-wasm` is oxlint `--deny-warnings` clean.

Named `JsonValue` parse at host capabilities, guest manifests, host faults,
placements, and pacts. Empty-object spreads use `undefined`. Remaining `as`
assertions carry a `SAFETY:` comment on the preceding line.
