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
2. `git rebase origin/main` (for stacks: `gh stack sync` / `gh stack rebase` — see `sdlc` skill `references/stacked-prs.md`)
3. Resolve conflicts without dropping either side's unrelated work.
4. Run `pnpm run agent:check -- --base=origin/main` for final PR-base validation.
5. Open or update the PR (multi-layer work: `gh stack submit --auto --open`).
6. Request squash auto-merge only when mergeability and required checks are clean — or, for
   stacked multi-phase work, use the parent **bottom-up squash-merge** protocol in the `sdlc`
   skill (`gh stack merge <pr> --yes --squash` per layer after review).
7. Resolve requested changes and actionable comments — leave no open actionable threads.
8. Re-run the narrow relevant gate after repairs, then repeat PR-base validation only when the repair changes branch-level risk.
9. Clean the worktree and archive the thread only when supported by the active client tooling.

## Stacked PRs

Multi-step / multi-phase work uses GitHub's official stacked PRs (`gh extension install github/gh-stack`).
Parent agent owns stack topology; subagents do incremental commits on their layer. Full protocol:
`sdlc` skill → `references/stacked-prs.md` and companion skill `gh-stack`.

Local agent defaults (also applied by `scripts/install-hooks.mts` / `setup-agent-tools.sh`):

```bash
git config --local rerere.enabled true
git config --local remote.pushDefault origin
```

## Merge Discipline

Do not claim completion, mark a PR ready, or merge while required checks are failing or pending
**for real code reasons** (tests, lint, architecture, secret findings that executed).

**Billing / spending-limit / quota failures do not block squash-merge.** When jobs never start
(no runner, empty steps, "payments have failed", "spending limit needs to be increased"):
document the exception on the PR, then **squash-merge immediately** (`gh pr merge --squash` /
`gh stack merge --yes --squash`; `--admin` if protection still requires green checks). Tell the
user billing needs repair asynchronously — do not leave reviewed PRs open waiting on CI that
cannot run.

Address all review comments before squash-merge. If another merge worker owns the final merge,
report the exact remaining state instead of pretending it shipped.
