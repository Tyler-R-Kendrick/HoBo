---
layout: ../../layouts/Docs.astro
title: Platform Engineer operator
description: "Crew Platform Engineer: author and auto-generate Resource Definitions, Packs, and policy pack proposals."
---

# Platform Engineer operator

**Mission:** author and **auto-generate** Resource Definitions / Packs and policy pack proposals — the AI counterpart to the human platform-engineer persona.

## What it does

- Proposes resource definitions and provider packs via the generation pipeline.
- Drafts policy packs for human review (cannot silently widen deny ceilings).
- Uses MCP tools such as `propose-definition` / `propose-pack`.
- Works through Matching, packs, and policy planes — not ad-hoc cloud consoles.

## Engine

The **generation pipeline** is the engine. Outputs are gated like any other generated artifact: conformance, evals, policy, and often require-approval in prod.

## Boundaries

- Cannot bypass mandatory org policy.
- Cannot register providers without the corresponding control-plane RBAC action.
- Proposals are Deltas/PRs with blast radius, not silent YAML edits on disk of record.

## Related

[Custom providers](/HoBo/guide/custom-providers/) · [Shared model](/HoBo/crew/shared-model/) · [SWE](/HoBo/crew/swe/) (app code vs platform definitions)
