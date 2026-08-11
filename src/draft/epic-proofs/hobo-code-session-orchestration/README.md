# HoBo Code resident session orchestration

This epic proof composes the canonical session contract with the existing HoBo Code harness experience. It proves that one task branch/worktree can expose all lifecycle commands through one client-neutral boundary.

## Architecture

```mermaid
flowchart LR
  Clients[CLI, TUI, browser, remote] --> Commands[Versioned commands]
  Commands --> Session[Resident session actor]
  Session --> Tmux[tmux panes]
  Session --> Journal[SQLite journal]
  Session --> Git[task worktree and PR stack]
  Session --> Snapshot[shared snapshot and events]
```

## Acceptance

- The command suite includes session, pane, agent, checkpoint, Git, and stacked-PR lifecycle operations.
- Detach and reattach are explicit operations and never imply session shutdown.
- Every client consumes the same snapshot contract.
