# ADR: resident HoBo Code session orchestration

## Status

Accepted for implementation.

## Decision

A named session is a resident control-plane actor for exactly one task branch/worktree. It may own many tabs, tmux-backed panes, and agent harness processes. CLI, TUI, browser, and remote clients send the same versioned commands and observe the same revisioned snapshot/event stream.

The implementation reuses tmux for PTY ownership, the local SQLite event store for durability, and Git/`gh stack` for delivery. No second terminal emulator, event store, or PR model is introduced.

At the boundary, **parse, don't validate** converts JSON commands into generated, parsed domain types. The resident session actor appends command-result events to the SQLite event store; its snapshot projection is the materialized view and shared read store for every client.
