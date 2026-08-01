---
type: Reference
title: "Designer council SDLC state"
description: "Coordinator-owned delivery state for the exact-six OptimizeXP designer consensus gate."
tags: [hobo, sdlc, optimizexp, design-council, consensus]
---

# Initiative: Designer council

**Phase:** review  
**Slug:** `designer-council`  
**Opened:** 2026-08-01  
**Host:** Codex

## Goal

Add an evidence-backed, exact-six designer council to OptimizeXP and make its
current-head unanimous approval a mandatory SDLC closeout gate for
design-relevant work.

## Ownership

- Coordinator: shared skill references, mirrors, hard gates, state, and delivery.
- Persona author: the six canonical persona files only.
- Protocol engineer: isolated deterministic council library, CLI, and focused tests.
- SDLC integration engineer: isolated tests and coordinator patch recommendations.
- Test/validation engineer: cross-cutting acceptance and adversarial validation.
- Independent reviewer: read-only final bypass and provenance review.

## Delivery

- Base: `origin/main` at `eb01285b4b68bc67b40ae81a5de061e17085561d`
- Branch: `feat/designer-council`
- PR: [#1007](https://github.com/Tyler-R-Kendrick/HoBo/pull/1007)
- Reviewed branch head before council: `5ec1537c5f4da0ba1f7999051f95ef87fe0a702a`
- Local final validation: 743 files passed; 4,629 tests passed; one skipped.
- OptimizeXP preflight policy: safe, in-scope doctor repairs have standing approval;
  destructive, networked, secret-bearing, and unrelated actions remain excluded.

## Designer consensus

```yaml
designerConsensus:
  required: true
  reviewId: pending
  cycle: 0
  result: pending
  consensusEntryId: null
  proposalDigest: null
  reviewedHeadSha: null
  assertedAt: null
```

The Markdown record is a coordinator view only. The council state and
append-only bus entries are authoritative.
