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
- `@hobo/provider-prisma-postgres`

Named `JsonValue` parse at the Neon claimable-database REST boundary and the
Prisma `create-db` JSON/human output boundary. Empty-object spreads use
`undefined`. Remaining `as` assertions carry a `SAFETY:` comment on the
preceding line. Control-character flattening no longer uses control-regex
literals.
