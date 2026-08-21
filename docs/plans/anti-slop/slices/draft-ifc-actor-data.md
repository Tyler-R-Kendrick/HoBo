---
type: Plan
title: "anti-slop slice: ifc handler, actor host, data paradigm"
description: "File-complete anti-slop cleanup for ifc-handler-trigger-contract, actor-host-runtime-port-contract, and data-paradigm-authoring-contract."
tags: [hobo, anti-slop, oxlint]
---

# ifc handler + actor host + data paradigm slice

Layer `sdlc/anti-slop-56-draft-ifc-actor-data`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `ifc-handler-trigger-contract`, `actor-host-runtime-port-contract`, and `data-paradigm-authoring-contract` is clean.

Local `src/json.ts` parse boundary. Handler returns `JsonValue | void`. Actor leases are a named `ActorLease` host type. Tests: ifc 6 + `tsc`, actor 13, data 9 + `tsc`.
