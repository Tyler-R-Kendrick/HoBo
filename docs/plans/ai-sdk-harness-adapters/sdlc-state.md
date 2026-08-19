---
type: Reference
title: "AI SDK harness adapters initiative state"
description: "Durable loop state for AI SDK HarnessAgent + in-repo HarnessV1 adapters."
tags: [hobo, plans, sdlc, code, harness]
---

# Initiative: AI SDK harness adapters

**Phase:** closed  
**Slug:** `ai-sdk-harness-adapters`  
**Opened:** 2026-08-18  
**Closed:** 2026-08-18 

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
| [#1128](https://github.com/Tyler-R-Kendrick/HoBo/pull/1128) | feat(code): typed runtime.adapter on harness specs | squash-merged `ef18fb270` | layer 01 |
| [#1129](https://github.com/Tyler-R-Kendrick/HoBo/pull/1129) | feat(code): AI SDK HarnessAgent runtime adapters | squash-merged `b5d0840d2` | layer 02; rebased onto #1128 squash |

## Designer consensus

Layer 01 (`#1128`, reviewed head `a14a4d151`):

```yaml
designerConsensus:
  required: true
  reviewId: pr-1128
  cycle: 0
  result: yay
  consensusEntryId: pr-1128-cycle-0-consensus
  proposalDigest: 340aa4717b7c6e010aaef49ad4ab5c5687e9249de751205b742b19663a1a9308
  reviewedHeadSha: a14a4d151ed31233ff6a2d849a4a6f0bb29e21ed
  assertedAt: 2026-08-19T00:49:34Z
```

Layer 02 (`#1129`, reconvened after #1128 squash; reviewed head `b212e1d36`):

```yaml
designerConsensus:
  required: true
  reviewId: pr-1129
  cycle: 0
  result: yay
  consensusEntryId: pr-1129-cycle-0-consensus
  proposalDigest: 4ff63bba0cda10c841298d363ab27f5555d2e1ce3649fd867444b6ba3dce3529
  reviewedHeadSha: b212e1d361cb18d37c37800e54be8876bcc8e8f7
  assertedAt: 2026-08-19T00:50:20Z
```
