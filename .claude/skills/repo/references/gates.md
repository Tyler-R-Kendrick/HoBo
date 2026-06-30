---
type: Agent Skill Reference
title: "Repo gates"
description: "Select validation commands from fastest changed-scope checks to final repo gates."
tags: [hobo, repo, gates, validation]
timestamp: 2026-06-30T00:00:00Z
---

# Repo Gates

Failed validation is not a completion state. Fix the failure or report the blocker with evidence.

## Validation Order

1. Changed-file or staged checks.
2. Package or workspace checks.
3. Affected repo checks.
4. Final required gates.

## Common Commands

- Staged path: `pnpm.cmd run check:relevant:staged`
- Branch path: `pnpm.cmd run check:relevant -- --base=origin/main`
- Final agent path: `pnpm.cmd run agent:check`
- Technical standards: `pnpm.cmd run standards:check -- --base=origin/main`
- OKF structure: `pnpm.cmd run docs:okf`
- Skill validation: `py -3 C:\Users\conta\.codex\skills\.system\skill-creator\scripts\quick_validate.py <skill-folder>`

## Gate Rules

- Do not bypass hooks or use `--no-verify`.
- Do not run full repo lint, test, typecheck, build, or codegen during implementation when an affected or changed-scope command exists.
- If a command times out or starts broad work unexpectedly, stop and narrow scope before retrying.
- Run final validation once the implementation is complete and conflicts are resolved.
