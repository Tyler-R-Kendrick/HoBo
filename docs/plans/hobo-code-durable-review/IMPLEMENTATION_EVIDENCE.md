# Durable review — implementation evidence

Date: 2026-08-12
Branch: `feat/hobo-code-durable-review`
Package: `@hobo/code`

## Requirements covered

| Requirement | Surface |
|---|---|
| Versioned command/snapshot | `hobo.code.review-command/v1`, `review-snapshot/v1`, proto/CUE |
| Separate review aggregate | EventStore partition `hobo-code-reviews`, stream `code-review:<id>` |
| Semantic pageable diffs | `git-review-source`, `unified-diff-parser`, cursors, content store |
| Anchors, generations, coverage | `review-generations`, `review-anchors`, `review-reanchor`, `review-coverage` |
| Durable threads | aggregate events for thread/message CRUD |
| GitHub provider | `github-review-provider` with allowlist, argv-safe `gh`, correlation, reconcile |
| Exact-effect + ledger | `review-approval`, `review-delivery-ledger`, `review-orchestrator` |
| Terminal reviewer | native Pi/rubberhose pane, not Hunk/OpenTUI |
| Browser reviewer | `/code/reviews*` on the authenticated loopback server |
| Agent routing | `review-agent-transport` through resident session agents |
| Inbox + stack | derived inbox projection; stack provenance |
| Hunk/range stage + suggestions | `review-patch` + exact-effect apply |
| Security / a11y / perf | sanitizer tests, browser CSP/no-store, inbox projection bound |
| Tests | unit, property, integration, contract, recovery, terminal, HTTP |

GitHub is the only implemented forge. Other forges are not claimed.

The Git workbench still authorizes the staged tree. Review coverage is a
separate record of what the reviewer inspected.

## Validation

Package tests after integration: 679 passed, 4 skipped
(`pnpm --prefix packages/code test`).

Coordinator also ran focused review suites for runtime, orchestrator,
GitHub provider, patch apply, inbox, stack, terminal, agent routing, and HTTP.

## Threat-model notes

- Unknown command schemas fail closed (`parseReviewCommand`).
- Review events stay off the session partition.
- Remote and index mutations require exact-effect digests and a durable ledger.
- Terminal rendering strips OSC/DCS/CSI/BEL/CR/bidi hijacks.
- Agent prompts delimit untrusted source/comments and redact secrets.
- GitHub hosts are allowlisted; `gh` is argv-safe.
- Browser review routes inherit loopback bearer auth and `no-store`.
