---
type: Agent Skill Reference
title: "OptimizeXP — Vercel Workflow DevKit notes"
description: "Optional durable local workflows via Workflow DevKit Local World for cross-agent review loops."
tags: [hobo, optimizexp, vercel, workflow-devkit]
timestamp: 2026-07-30T00:00:00Z
---

# Vercel Workflow DevKit (optional)

Use when you want **durable, replayable steps** for the optimizexp review loop without a host-native workflow engine.

## Why

- Deterministic replay after crash/deploy mid-loop
- Step I/O recorded
- Local World runs without cloud provisioning (JSON under `.workflow-data/`, in-memory queue)

## Concepts (vendor)

- **Workflow** — durable function (`"use workflow"` directive in WDK)
- **Step** — isolated unit of work with recorded inputs/outputs
- **World** — infrastructure adapter; Local World for laptop, Vercel World for managed

Docs: [Vercel Workflows](https://vercel.com/docs/workflows), [Workflow SDK](https://workflow-sdk.dev).

## Fit for OptimizeXP

| Step | Durable? |
|---|---|
| `initRun` | yes |
| `validateBus` | yes |
| `aggregateScores` | yes |
| `detectPlateau` | yes |
| Persona "feelings" generation | no — agent-side |
| GUI/CLI exploration | no — agent-side with bus expect/outcome |

## Adoption rule (this repo)

- **Do not add WDK as a dependency** unless a task explicitly opts in.
- Ship the plain `review-loop.mts` first.
- If adopting WDK, isolate under `workflows/cross-agent/wdk/` and gitignore `.workflow-data/`.
- Keep bus JSON the source of truth for metrics evidence regardless of WDK event log.

## Skeleton (illustrative only)

```ts
// workflows/cross-agent/wdk/review.ts — NOT wired by default
export async function optimizexpReview(runId: string) {
  "use workflow";
  await initRun(runId);
  // loop controlled by agent callbacks or step results
  await aggregateScores(runId);
  return await detectPlateau(runId);
}
```
