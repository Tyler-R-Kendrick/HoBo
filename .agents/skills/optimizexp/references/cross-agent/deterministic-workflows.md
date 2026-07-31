---
type: Agent Skill Reference
title: "OptimizeXP cross-agent deterministic workflows"
description: "Template for hosts without native workflows: call deterministic local code for the review loop."
tags: [hobo, optimizexp, cross-agent, workflows]
timestamp: 2026-07-30T00:00:00Z
---

# Cross-agent deterministic workflows

Some hosts lack durable workflow runtimes. Provide a **shared TypeScript (or shell) runner** the agent invokes so the loop is deterministic even when the LLM is not.

## Pattern

```text
Agent (any host)
  → reads persona prompts + scope
  → calls: node --import tsx workflows/cross-agent/review-loop.mts --run <id> ...
       → steps are pure-ish functions with logged I/O
       → optional Vercel WDK Local World for durable replay
  → agent still writes bus expect/outcome around human/UI interactions
  → runner owns score aggregation + plateau detection files
```

## What stays in the agent

- Persona judgment and feelings text
- Choosing which surface to probe next
- Writing natural-language findings

## What stays in deterministic code

- Flag resolution
- Schema validation of bus entries
- Metric aggregation + plateau detection
- File layout for runs/
- Optional: spawning commands and capturing transcripts

## Minimum CLI

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
  --mode init \
  --run 20260730-dx-ax-demo \
  --experiences dx,ax \
  --personas developer,agent-operator

node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
  --mode score --scores path/to/cells.json
```

If `tsx` is not installed yet, the same entrypoint runs under `node --experimental-strip-types`.

## Integration options

1. **Plain Node/tsx** (default template) — zero extra deps.
2. **Vercel Workflow DevKit** — `"use workflow"` steps + Local World under `.workflow-data/` for crash-safe iteration state; see `vercel-wdk.md`.
3. **Shell driver** — `review.sh` calling the same mts entry for CI agents.

## Contract with bus

Runner never invents feelings. It may refuse to advance iteration if the latest expect lacks a matching outcome (`validate-bus`).
