---
type: Plan
title: "anti-slop slice: runner providers"
description: "File-complete anti-slop cleanup for runner-depot and provider-flux."
tags: [hobo, anti-slop, oxlint, providers]
---

# runners slice

Layer `sdlc/anti-slop-12-providers-runners`. These packages are oxlint
`--deny-warnings` clean:

- `@hobo/runner-depot`
- `@hobo/provider-flux`

Named `JsonValue` parse at Depot RPC and Flux deploy-spec boundaries.
Empty-object spreads use `undefined`. Remaining `as` assertions carry a
`SAFETY:` comment on the preceding line.
