---
type: Plan
title: "anti-slop slice: mcp"
description: "File-complete anti-slop cleanup for packages/mcp."
tags: [hobo, anti-slop, oxlint, mcp]
---

# mcp slice

Layer `sdlc/anti-slop-10-mcp`. `packages/mcp` is oxlint `--deny-warnings`
clean (named CliEnvelope/JsonValue parse). Also zeros
`packages/cloud/src/gateway/gateway.ts` so `CommandEmitter.emit` can take
the data package's `JsonObject` event payload.
