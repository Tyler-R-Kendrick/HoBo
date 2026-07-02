---
type: Agent Skill Reference
title: "SDLC dispatch protocol"
description: "Permission-gated dispatch of implementer subagents in worktrees, with an independent Done rule and resume/reconcile."
tags: [hobo, sdlc, dispatch, subagents]
timestamp: 2026-07-02T00:00:00Z
---

# Dispatch

## Permission gate

Ask the user before offloading ANY work to implementation subagents, once per initiative (or
per batch if the user prefers). No permission → the loop stops at the Linear capture phase.

## Claim protocol (race-free by construction)

The COORDINATOR owns all Linear state. Per issue, in order:

1. Set the issue's assignee + state → In Progress (coordinator, before any spawn).
2. Spawn one `implementer` subagent (worktree isolation) with the issue id, full body, branch
   name (`sdlc/<issue-id>-<slug>`), and the acceptance checklist. Implementers get ZERO Linear
   access and never edit shared files.
3. On completion the implementer leaves `.sdlc/report.json` in the worktree:
   `{issue, branch, prUrl?, gates:[{name,pass}], cascadeDeltas:[{file,change}], requirementChanges:[...]}`.
4. Spawn the `reviewer` subagent (read-only) on the worktree with the same checklist.
5. **Done rule:** move the issue to Done only when BOTH hold:
   (a) GitHub reports the PR checks green — query it yourself; never trust the report file for
   this — and (b) the reviewer passes the checklist. Otherwise: back to the implementer with the
   reviewer's findings (same worktree), or re-plan the issue.
6. Apply `cascadeDeltas` yourself, serially: traceability rows, ledgers, registries, GAPS-style
   registers, Linear comments. Append the outcome (success/failure + failure class + contract
   defect if any) to `docs/plans/dispatch-log.md`.

## Resume / reconcile (on every session entry with live state)

- `git worktree list` vs state-file dispatches vs Linear In-Progress vs open PRs.
- In-Progress issue with no live worktree/PR → back to Todo with a comment; prune orphan
  worktrees (`git worktree prune` for stale metadata only — never delete user work).
- Un-ingested `.sdlc/report.json` in a surviving worktree → ingest before dispatching anything new.

## Parallelism

Cap concurrent implementers so their scopes never share a package; shared-file work is
coordinator-only, which removes the usual merge-conflict class by construction.
