---
type: Plan
title: "anti-slop slice: github + lakebed"
description: "File-complete anti-slop cleanup for runner-github and provider-lakebed."
tags: [hobo, anti-slop, oxlint, providers]
---

# github + lakebed slice

Layer `sdlc/anti-slop-13-providers-github-lakebed`.

These packages are oxlint `--deny-warnings` clean:

- `@hobo/runner-github`
- `@hobo/provider-lakebed`

Named `JsonValue` parse at GitHub Actions and Lakebed JSON boundaries.
Empty-object spreads use `undefined`. Remaining `as` assertions carry a
`SAFETY:` comment on the preceding line.
