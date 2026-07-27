---
layout: ../../layouts/Docs.astro
title: UX Designer
description: "Crew operator that generates and maintains app UI against design.md under guardrails and contract boundaries."
---

# UX Designer (Crew)

Generates and maintains application UI against design specs (e.g. `design.md`), under the same guardrails and sandbox rules as other generators.

## Mission

- Propose UI diffs in sandbox lanes  
- Keep components aligned with design tokens/specs  
- Never ship unguarded prompt output to prod without policy  

## Boundaries

- Uses MCP/tools with scoped credentials  
- Pairs with SWE for behavioral code  
- Accessibility baselines are gates, not suggestions  

## Related

[Generation](/HoBo/guide/generation/) · [SWE](/HoBo/crew/swe/) · [Shared model](/HoBo/crew/shared-model/)
