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
- `@hobo/provider-kafka`
- `@hobo/provider-ttl-sh`

Named `JsonValue` parse at webernetes plans/pacts, Kafka cluster/topic JSON,
and ttl.sh payload/pact/receipt scan boundaries. Empty-object spreads use
`undefined`. Remaining `as` assertions carry a `SAFETY:` comment on the
preceding line. Control-character flattening no longer uses control-regex
literals. Tests use core `parseTopicName` / `parseTenantId` helpers instead of
`as never`.
