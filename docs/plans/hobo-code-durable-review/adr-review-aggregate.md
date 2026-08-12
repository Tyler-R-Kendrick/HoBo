# ADR: Review is a separate durable aggregate

Status: Accepted

## Decision

Hobo-code review state lives in EventStore partition `hobo-code-reviews` on
streams `code-review:<reviewId>`. Resident session snapshots keep at most a
compact review id. Full diffs, comment bodies, and provider payloads are
content-addressed outside session events.

## Why

Session events already carry PTY/pane snapshots. Embedding review diffs would
bloat every keystroke and couple read-heavy review history to terminal
liveness. tuicr-style durability requires generations, coverage, and
publication ledgers that must survive session detach.

## Consequences

- Session and review revisions are independent.
- Exact-effect review mutations use the same ledger discipline as commit/push/PR.
- GitHub is the only implemented provider. Other forges are not claimed.
- The Git workbench remains a mutation snapshot; it is not reviewed-coverage.
