---
type: Plan
title: "anti-slop slice: kafka + webernetes + ttl-sh"
description: "File-complete anti-slop cleanup for provider-webernetes, provider-kafka, and provider-ttl-sh."
tags: [hobo, anti-slop, oxlint, providers]
---

# kafka + webernetes + ttl-sh slice

Layer `sdlc/anti-slop-15-providers-kafka-webernetes-ttl`.

These packages are oxlint `--deny-warnings` clean:

- `@hobo/provider-webernetes`

Named `JsonValue` parse at webernetes plans/pacts. Empty-object spreads use
`undefined`. Remaining `as` assertions carry a `SAFETY:` comment on the
preceding line.
