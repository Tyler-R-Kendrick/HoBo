# HoBo.CI

HoBo CI is a sibling SDK family in the HoBo monorepo:

| SDK | State |
| --- | --- |
| `@hobo/ci` | Allocation routing, hard budget eligibility, shared protobuf contracts |
| [`@hobo/ci-gh-actions`](../ci-gh-actions/README.md) | Executable experimental hosted relay and JIT-runner bridge |
| [`@hobo/ci-dagger`](../ci-dagger/README.md) | Planned Dagger adapter scaffold |
| [`@hobo/ci-cf`](../ci-cf/README.md) | Planned `@cloudflare/ci` adapter scaffold |

The GitHub Actions target keeps the original workflow and its logs, artifacts,
permissions, environments, dependencies and status checks. After one-time repository
connection, user workflows select `runs-on: hobo`.

Routing considers only enabled, acknowledged provider offers owned by this account.
It reserves the complete host timeout, including startup, under a durable transaction.
Usable measured free allocation is consumed across providers first; then HoBo's
existing `@hobo/dispatcher` chooses the cheapest paid candidate. Remaining partial
free minutes are used before an entirely paid offering, provided the possible paid
remainder fits both budgets. A job stays on its selected machine until it finishes.
Provider budgets and concurrency limits can cause another eligible provider to win.
If none qualifies, the job remains durably queued. Allocation must remain valid for
the entire reserved host duration to count as free.

Unknown balances are zero. Offers require an observation time, expiry/freshness
limit and evidence URL. Prices are account-supplied integer USD microdollars per
minute, including applicable platform fees; this package ships no vendor price
catalog or assumed marketing allowances. One microdollar is $0.000001. Each provider
account entitlement has one account/offer owner; there is no cross-tenant pooling.

`spentMicros` is an immutable external-spend baseline for this relay partition's
budget period. The relay adds its settled costs and outstanding reservations. Do
not replace the baseline with a provider total that already includes these leases.
Refreshing free balance evidence can change `observedAt`/`freeMinutes`; outstanding
reservations are always subtracted conservatively. This first version has no
invoice ingestion or automatic monthly budget rollover. Start a new budget-period
partition only after reconciling all active leases; retain the old journal for audit.

Contracts are generated from `data-models/ci.proto`; CUE constraints and valid/invalid
fixtures are exercised by schema-tools. `parseConfiguration` is the configuration
boundary. Routing is pure over the account, persisted leases and injected time.
The relay owns the `ci.*` command/event lifecycle and SQLite projection (see its ADR).

Validation: `pnpm --filter @hobo/ci build`, `pnpm --filter @hobo/ci test`,
`pnpm codegen -- --filter packages/ci`, and
`pnpm codegen:check -- --filter packages/ci`.
