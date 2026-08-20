---
type: Plan
title: "anti-slop slice: neon + prisma-postgres"
description: "File-complete anti-slop cleanup for provider-neon and provider-prisma-postgres."
tags: [hobo, anti-slop, oxlint, providers]
---

# neon + prisma-postgres slice

Layer `sdlc/anti-slop-16-providers-neon-prisma`.

These packages are oxlint `--deny-warnings` clean:

- `@hobo/provider-neon`

Named `JsonValue` parse at the claimable-database REST boundary. Empty-object
spreads use `undefined`. Remaining `as` assertions carry a `SAFETY:` comment
on the preceding line.
