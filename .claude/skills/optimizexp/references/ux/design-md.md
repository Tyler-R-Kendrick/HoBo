---
type: Agent Skill Reference
title: "OptimizeXP UX — DESIGN.md"
description: "Using DESIGN.md as the agent-facing design contract and keeping CSS in sync."
tags: [hobo, optimizexp, ux, design-md]
timestamp: 2026-07-30T00:00:00Z
---

# UX — DESIGN.md

## Role

`DESIGN.md` is the **agent-readable design system**: tokens, typography, do/don't aesthetic, and constraints models can follow without reverse-engineering CSS.

Format reference: [google-labs-code/design.md](https://github.com/google-labs-code/design.md).

## HoBo layout

| Path | Role |
|---|---|
| `site/DESIGN.md` | Source of truth for public site aesthetic |
| `site/src/styles/global.css` | Implementation |
| `pnpm --filter hobo-site run design:lint` | Structural + WCAG gate |
| `.agents/skills/design-md/SKILL.md` | Agent procedure |

## Optimization checklist

1. Front matter tokens complete and named for agents (not only designers).
2. Overview states non-negotiable aesthetic in one screen.
3. Do / Don't lists are concrete (colors, motion, imagery bans).
4. Lint is in CI / agent:check path for site changes.
5. Export targets (CSS theme, DTCG) stay optional secondary — DESIGN.md stays primary.

## Uncertainty smells

- DESIGN.md says ink/paper; components ship SaaS blue
- Night mode described but no token inversion
- Agents invent glassmorphism because docs never forbade it

## Related

Load with `references/ux/design-systems.md` for broader inventory beyond the DESIGN.md file.
