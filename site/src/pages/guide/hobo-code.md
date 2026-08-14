---
layout: ../../layouts/Docs.astro
title: hobo-code
description: "The interactive Bo session: hobo-code vs hobo, how to start talking, and what stays out of the control-plane CLI."
---

# hobo-code

`hobo-code` is the **interactive coding session** (Bo). `hobo` is the **control-plane CLI** (`up` / `down` / `plan` / `dev` and the rest of the canonical verb set). They are different binaries.

`@hobo/*` is **not on npm**. Do not run `npx hobo` or invent `npx hobo-code`. After you clone this repo:

```sh
pnpm install
pnpm exec turbo run build --filter @hobo/adapter-hono --filter @hobo/code --filter @hobo/hobo
pnpm --filter @hobo/code exec hobo-code
```

That starts the session. From there, **talk** for hello-world / run / debug. Zero-LLM pattern lookup is explicit: `hobo-code template …` or `/template web frontend backed by an api` (ADR-0153). Ordinary chat is not silently intercepted for arbitrary queries.

## What belongs where

| You want | Use |
|---|---|
| Plan / converge / tear down an existing Bindle | `hobo plan` / `hobo up` / `hobo down` / `hobo dev` |
| Author or extend an app by talking | `hobo-code` session |
| Search/render a pattern with no model | `hobo-code template` or `/template` |
| Agent tool calls over the same verbs | `hobo-mcp` — see [the MCP surface](/HoBo/agents/mcp/) |

## Honest limits

- Workspace build first. A half-built tree cannot import `@hobo/adapter-hono`.
- Default apply is still the in-memory Pulumi stand-in. Live lanes are credential-gated.
- Known intents fill templates. Implementation holes marked `"use training"` stay holes until training exists.

Next: [Getting started](/HoBo/guide/getting-started/) · [The hobo CLI](/HoBo/guide/cli/) · [Try HoBo](/HoBo/examples/).
