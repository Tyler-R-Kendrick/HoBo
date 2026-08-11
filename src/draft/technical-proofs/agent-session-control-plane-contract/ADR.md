# ADR: one session command boundary

## Status

Accepted for implementation.

## Context

The former `hobo-code session` path was an in-process helper, so CLI, TUI, and remote clients could not share or resume the same agent harness session.

## Decision

Use `SessionCommandEnvelope`, `SessionEventEnvelope`, and `SessionSnapshot` from the production protobuf as the sole client/runtime boundary. Parse untrusted JSON once with `parseSessionCommand`; reject unknown schema versions, absent commands, and command-specific missing fields. A session owns one task branch/worktree and may own many tabs, panes, and agent runs.

This is **parse, don't validate**: successful parsing returns generated, parsed domain types; core code never receives the raw JSON object.

Commands produce ordered events and a revisioned snapshot. The resident runtime is the actor, its SQLite event store is the journal, the snapshot projection is the materialized view, and every client uses that snapshot as its read store.

## Consequences

Later runtime and client layers must implement this contract instead of adding local state models. The parser benchmark is advisory; terminal I/O and Git operations dominate its cost.
