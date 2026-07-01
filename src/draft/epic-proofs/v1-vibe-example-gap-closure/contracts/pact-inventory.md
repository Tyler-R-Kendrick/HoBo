# Pact Inventory

| Boundary | Consumer | Provider | Protocol | Pact file/test | Provider verification | Mock used in simulation | Status |
|---|---|---|---|---|---|---|---|
| Child backlog fixture | V1VibeGapClosureReferenceApp | VibeChildBacklogBoundary | HTTP-style request/response | `contracts/pacts/vibe-child-backlog-boundary.pact.json`; `contracts/consumer/vibe-gap-boundaries.test.ts` | Provider unavailable; Linear is live source of truth but tests consume deterministic fixture | Checked-in child issue matrix for HOBO-540 through HOBO-565 | consumer_tested |
| Scope guard | V1VibeGapClosureReferenceApp | VibeScopeGuardBoundary | HTTP-style request/response | `contracts/pacts/vibe-scope-guard-boundary.pact.json`; `contracts/consumer/vibe-gap-boundaries.test.ts` | Provider unavailable; production feature owners are out of scope | Regex guard over forbidden production/provider/customer-data/credential/claim requests | consumer_tested |
| Unblock ledger | V1VibeGapClosureReferenceApp | VibeUnblockLedgerBoundary | HTTP-style request/response | `contracts/pacts/vibe-unblock-ledger-boundary.pact.json`; `contracts/consumer/vibe-gap-boundaries.test.ts` | Provider unavailable; Linear status transition happens after PR review/merge | Deterministic ledger output that names the downstream unblock condition | consumer_tested |

All providers are mocked because this is a design-phase coordination proof. The live Linear blocker
state remains authoritative; this package records the branch-reviewable acceptance evidence.
