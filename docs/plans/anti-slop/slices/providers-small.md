---
type: Plan
title: "anti-slop slice: small providers"
description: "File-complete anti-slop cleanup for the smallest provider packages."
tags: [hobo, anti-slop, oxlint, providers]
---

# small-providers slice

Layer `sdlc/anti-slop-11-providers-small`. These packages are oxlint
`--deny-warnings` clean:

- `@hobo/provider-config`
- `@hobo/provider-agentv`
- `@hobo/provider-cedar`
- `@hobo/provider-opa`
- `@hobo/provider-ax`
- `@hobo/runner-blacksmith`

Named `JsonValue`/`JsonObject` parse at untrusted JSON boundaries (OPA/Cedar
verdicts, Blacksmith well-known manifests, ax span I/O). Empty-object spreads
use `undefined`. Remaining `as` assertions carry a `SAFETY:` comment on the
preceding line.

Larger provider packages (digitalocean, cloudflare, azure, and the rest of
`packages/providers`) stay on later layers. Full-repo
`lint:slop --deny-warnings` is still red.
