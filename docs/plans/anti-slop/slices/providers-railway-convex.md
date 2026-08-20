---
type: Plan
title: "anti-slop slice: railway + convex"
description: "File-complete anti-slop cleanup for provider-railway and provider-convex."
tags: [hobo, anti-slop, oxlint, providers]
---

# railway + convex slice

Layer `sdlc/anti-slop-14-providers-railway-convex`.

These packages are oxlint `--deny-warnings` clean:

- `@hobo/provider-railway`
- `@hobo/provider-convex`

Named `JsonValue` parse at Railway plans/pacts and Convex management/manifest
JSON. Empty-object spreads use `undefined`. Remaining `as` assertions carry a
`SAFETY:` comment on the preceding line.
