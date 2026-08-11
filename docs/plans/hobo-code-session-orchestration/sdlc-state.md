---
type: Maintenance Note
title: "hobo-code-session-orchestration sdlc-state"
description: "Durable SDLC state for resident HoBo Code agent sessions."
tags: [hobo, code, sessions, sdlc]
---

# SDLC state — hobo-code session orchestration

**phase:** implementing
**base:** `origin/main` at `7e4ff4dda51344b1bff7fbf5ec9c0beacbbd8084`
**backend:** local Codex subagents where package scopes are exclusive; parent owns shared files and stack topology

## Locked decisions

- One persistent named session owns one task branch/worktree and may contain many tabs, panes, and agent runs.
- HoBo owns the durable control plane; tmux owns PTYs. No Herdr runtime dependency.
- CLI, TUI, and full-control loopback web clients share one typed command/snapshot/event boundary.
- Remote access uses declared Station machines and SSH forwarding; no public bind or ambient credential fallback.
- Control, checkpoints/diffs, commit/push, GitHub PR stacks, and notifications are in scope. Plugins and native desktop/mobile clients are not.
- Existing dirty files in the original `main` worktree are user-owned and excluded from this initiative.

## Planned stack

| Layer | Branch | Status | PR |
|---|---|---|---|
| 01 contracts and proofs | `sdlc/hobo-code-sessions-01-contracts` | complete | — |
| 02 resident runtime | `sdlc/hobo-code-sessions-02-runtime` | complete | — |
| 03 orchestration | `sdlc/hobo-code-sessions-03-orchestration` | complete | — |
| 04 TUI, web, and remote clients | `sdlc/hobo-code-sessions-04-clients` | in progress | — |
| 05 GitHub delivery and evidence | `sdlc/hobo-code-sessions-05-delivery` | pending | — |

## Acceptance

- A real tmux-backed session can create panes and agents, detach, survive daemon restart, reattach, switch, prompt, wait, stop, and delete without synthetic state.
- Session work is isolated in one branch-backed worktree; checkpoints restore staged, unstaged, and untracked files without moving the branch.
- TUI and browser clients expose the same live controls; remote browser and attach paths use brokered SSH forwarding.
- Commit, push, PR, and stacked-PR operations are approval-gated and observable.
- Real tmux, executable PACT, browser, disposable-Git, crash-recovery, and installed-binary acceptance tests pass.

## Reconciliation

- GitHub connector: no open `hobo-code` PRs at initiative start.
- Prior mux/editor/rift PRs are merged; this stack starts from current `origin/main`.
- Original worktree remains dirty only with pre-existing user changes; no initiative changes land there.
