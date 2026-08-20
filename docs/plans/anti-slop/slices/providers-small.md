---
type: Plan
title: "anti-slop slice: small providers"
description: "File-complete anti-slop cleanup for the smallest provider packages."
tags: [hobo, anti-slop, oxlint, providers]
---

# small-providers slice

Layer `sdlc/anti-slop-11-providers-small`.

Cleared so far (oxlint `--deny-warnings`):

- `@hobo/provider-config`
- `@hobo/provider-agentv`
- `@hobo/provider-opa`
- `@hobo/provider-cedar`

Named `JsonValue` parse at OPA/Cedar verdict boundaries. Empty-object
spreads use `undefined`.
