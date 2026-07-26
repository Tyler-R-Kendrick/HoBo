---
type: Agent Skill Reference
title: "Git and PR flow"
description: "Preserve git history, keep PRs mergeable, and finish with clean status checks and comments resolved."
tags: [hobo, repo, git, pull-request]
timestamp: 2026-06-30T00:00:00Z
---

# Git And PR Flow

Use git as the source of truth for state, ownership, and history.

## Git Rules

- Use `git mv` for tracked moves and renames.
- Use `git status --short` before and after edits.
- Do not delete, reset, checkout, or overwrite user changes unless explicitly asked.
- Do not delete local branches or worktrees unless the task explicitly asks for cleanup.

## Final PR Loop

1. `git fetch origin`
2. `git rebase origin/main`
3. Resolve conflicts without dropping either side's unrelated work.
4. Run `pnpm run agent:check -- --base=origin/main` for final PR-base validation.
5. Open or update the PR.
6. Request squash auto-merge only when mergeability and required checks are clean.
7. Resolve requested changes and actionable comments.
8. Re-run the narrow relevant gate after repairs, then repeat PR-base validation only when the repair changes branch-level risk.
9. Clean the worktree and archive the thread only when supported by the active client tooling.

## Merge Discipline

Do not claim completion, mark a PR ready, or merge while required checks are failing or pending. If another merge worker owns the final merge, report the exact remaining state instead of pretending it shipped.
