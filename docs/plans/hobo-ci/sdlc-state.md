# HoBo.CI session delivery state

- Branch: `feat/hobo-ci`
- Phase: implementation verified; preparing PR closeout
- Foundation commit: `2a71e90fa`
- Scope: monorepo SDKs, provider contracts, portable execution and local act tests
- External resources created for validation: none
- Parent owns shared contracts, registry/lock changes, review and merge.
- SDK implementation and act harness were reviewed independently and repaired.
- Designer consensus: required by SDK/API/docs path classification; current-head
  council evidence is recorded in the local OptimizeXP review bus before merge.
- PR number, final head and squash-merge status are authoritative in GitHub.

## Acceptance

GitHub Actions, Dagger and Cloudflare implement one portable command contract.
Provider selection respects usable credits, prices, account/provider budgets,
concurrency, expiry and backend capability. Replay is durable; only definitive
pre-allocation refusal can fail over. Real local act workflow execution is
asserted from job identities and independent artifacts, not exit status alone.

## Review repairs

Delayed expiry, changed credit facts, displaced Actions demand, uncertain launch,
abort/rejection races, input mutation, artifact truncation/size, UTF-8 bounds,
Cloudflare timeout/snapshot rules, account-bound scheduler contexts and Dagger command caching/teardown have
regression coverage. No live-provider proof is claimed by these tests.

Native pre-launch crash recovery cancels untouched reservations for fresh
admission; running intents remain uncertain. Disk reopen, journal rebuild and
completed-result replay are verified independently.

The SDK council rejected a broken documented pnpm invocation; the corrected
installer and harness commands passed, including 40 actual workflow jobs.
Closeout also repaired cross-cycle validation of resolved council findings:
22 protocol regressions pass, including current-cycle deletion and historical
tampering rejection. Resolved records remain auditable in the append-only bus.
