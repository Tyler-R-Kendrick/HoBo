---
type: Proof
title: "HOBO-641 Resource Definitions + Matching + Resource Packs"
description: "S4-05 executable proof for Resource Definitions, Matching with match.Decided, Deployment Set/Delta promotion, and installable Resource Packs."
tags: [hobo-641, platform-engineering, matching, resource-packs, s4-05]
---

# HOBO-641 Resource Definitions + Matching + Resource Packs

Executable proof for [Plan 25](../../platform-engineering.md#plan-25) platform-engineering surface (FR-060/061/062).

## Package

[`src/draft/technical-proofs/resource-definitions-matching-packs-contract`](../../../../src/draft/technical-proofs/resource-definitions-matching-packs-contract/README.md)

## Acceptance

- Matching test asserts expected definition wins with specificity score and `match.Decided` evidence
- Delta promotion yields immutable content-addressed Set with incremental reconcile nodes
- Installed pack definitions selected per Camp in multi-cloud shop plan

## Run

```bash
pnpm --prefix src/draft/technical-proofs/resource-definitions-matching-packs-contract test
```

Test entry: `src/draft/technical-proofs/resource-definitions-matching-packs-contract/test/resource-definitions-matching-packs.test.ts`.
