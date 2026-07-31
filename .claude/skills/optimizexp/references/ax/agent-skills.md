---
type: Agent Skill Reference
title: "OptimizeXP AX — agent skills"
description: "Skill authoring, progressive disclosure, and dual-tree mirrors for multi-agent hosts."
tags: [hobo, optimizexp, ax, skills]
timestamp: 2026-07-30T00:00:00Z
---

# AX — agent skills

## Anatomy

```text
SKILL.md                 # frontmatter + thin steps
references/              # progressive disclosure
workflows/               # optional host workflows
scripts/                 # optional deterministic helpers
```

## HoBo rules

- Mirror `.agents/skills/<name>` ↔ `.claude/skills/<name>` (byte-identical)
- `pnpm run skills:mirror-check`
- OKF frontmatter on reference concepts for `repo` / `draft` / `sdlc` / `optimizexp`
- Codex-valid YAML frontmatter on `SKILL.md`
- Progressive disclosure: load references by branch, not all at once

## Friction smells

- Skill body longer than needed; no references/
- Duplicate skills with different names across hosts
- Model-invoked description bloat (context load every turn)

## Uncertainty smells

- Skill tells agent to run full monorepo tests as first step
- Conflicting instructions vs `AGENTS.md`
- Missing completion criteria → premature completion

## Authoring pointer

See also `writing-great-skills` for predictability vocabulary (leading words, ladder, no-ops).
