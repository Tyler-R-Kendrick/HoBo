---
type: Reference
title: "AI SDK harness adapters initiative state"
description: "Durable loop state for AI SDK HarnessAgent + in-repo HarnessV1 adapters."
tags: [hobo, plans, sdlc, code, harness]
---

# Initiative: AI SDK harness adapters

**Phase:** closeout  
**Slug:** `ai-sdk-harness-adapters`  
**Opened:** 2026-08-18  
**Closed:**  

## Goal

Programmatic coding-agent turns dispatch on plugin `runtime.adapter` (closed
vocab, same rule as config `format`), never agent id. Builtin adapters load
`@ai-sdk/harness-*`. Custom `cli` / `eve` / `sdk` / `skip` stay in-repo
HarnessV1 until the SDK ships them. Host adapters use just-bash; bridge
adapters fail closed without an injected network sandbox.

## Stack topology

```text
main
 └── sdlc/ai-sdk-harness-01-schema     proto/CUE/codegen + parse + plugin JSON
  └── sdlc/ai-sdk-harness-02-runtime   HarnessV1/HarnessAgent + spawn + tests/docs
```

## Decisions

- Dispatch on `runtime.adapter`, never agent id.
- Kind defaults when `runtime` omitted: coding-agent→`cli`, eve-agent→`eve`,
  sdk→`sdk`, host/inference→`skip`.
- Goose stays `cli` until `@ai-sdk/harness-goose` exists.
- TTY seating remains mux/tmux; this layer is `createHarnessV1` /
  `createHarnessAgent` only.
- Designer consensus: required (proto/CUE/docs/README match design-relevant
  paths). Run exact-six council at layer closeout; exemption not valid.

## Kill-log / adversarial notes

- Do not treat local Station/rift as `@ai-sdk/sandbox-vercel`.
- Do not invent live ToolLoopAgent without injected `generateSdkText`.
- Leave unrelated dirty tree alone (`packages/sdk`, `external/ts-autocode`,
  site debug scripts, impeccable/node_modules).
- Layer 01 also materializes missing `@hobo/core` generated `_pb.ts` for
  ADR-0156 proto sources (`actor_host_port`, `cloud_provider_port`,
  `extension_plugin`) so `codegen:check` is green. Proto already lived on
  trunk; generated TS did not.

## Delivered PRs

| PR | Title | Result | Notes |
|---|---|---|---|
| (pending) | feat(code): typed runtime.adapter on harness specs | open | layer 01 |
| (pending) | feat(code): AI SDK HarnessAgent runtime adapters | open | layer 02 |

## Designer consensus

```yaml
designerConsensus:
  required: true
  reviewId:
  cycle:
  result:
  consensusEntryId:
  proposalDigest:
  reviewedHeadSha:
  assertedAt:
```
