# HoBo.CI

HoBo CI is a sibling SDK family in the HoBo monorepo:

| SDK | State |
| --- | --- |
| `@hobo/ci` | Portable pipelines, allocation routing and durable budget reservations |
| [`@hobo/ci-gh-actions`](../ci-gh-actions/README.md) | Executable experimental hosted relay and JIT-runner bridge |
| [`@hobo/ci-dagger`](../ci-dagger/README.md) | Implemented native Dagger SDK adapter |
| [`@hobo/ci-cf`](../ci-cf/README.md) | Implemented native Cloudflare CI adapter |

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


## Swap execution backends

`parsePipeline` constructs a deeply frozen command plan. `executePipeline` accepts
that exact plan and any `PipelineBackend`: `createActionsBackend({workspace})`,
`createDaggerBackend({sourceDirectory,image,connect?})`, or
`createCloudflareBackend({context,terminate,verifyShutdown?})`. Source workspaces
are bound by the host integration, rather than embedded host paths in pipeline
authoring. The shared subset includes sequential argv commands, relative cwd,
per-step environments, exact exit/stdout/stderr, tracked-file changes, bounded
binary file artifacts and acknowledged cancellation. The same fixture corpus
executes real local commands through every shipped adapter.

```ts
import { parsePipeline, executePipeline } from '@hobo/ci';
import { createActionsBackend } from '@hobo/ci-gh-actions';

const boundBackend = createActionsBackend({workspace: process.cwd()});
const pipeline = parsePipeline(JSON.stringify({
  id: crypto.randomUUID(), accountId: 'my-account', timeoutSeconds: 300,
  steps: [{id: 'test', argv: ['npm', 'test'], cwd: '.', env: {}}],
  artifactPaths: [],
}));
const result = await executePipeline(boundBackend, pipeline);
```

`HOBO_CI_EXECUTION_ID` is reserved metadata set to the logical execution ID on
all three backends. In Dagger it also prevents a new logical execution from using
a prior command's cached side effects. A pipeline ID is an idempotency key for
one logical run and source revision: use a run/attempt/revision-derived ID or a
UUID for a new execution, and reuse it only to replay that execution. Rebinding
a different source directory/revision while reusing an old ID does not request
a new run. Relative workspace paths are portable; host absolute paths and
provider-specific toolchain/environment defaults are not part of this contract.

## Apply routing and budgets

The Node coordinator `PipelineScheduler` from `@hobo/ci/scheduler` uses
`LeaseStore` from `@hobo/ci/store`. The original Actions relay uses the same
ledger, so its reservations and native pipelines cannot spend the same balance.
Bind eligible account offer IDs to real, account-scoped backend contexts;
construct `new PipelineScheduler(store, account.id, bindings)` for that account.
The scheduler rejects another account even if its offer IDs are identical.
`Offer.backend` is `gh-actions` (the legacy empty default), `dagger`, or `cf`.
The scheduler filters missing/incompatible backend bindings before free-first
ranking. Native reservations cover the pipeline's bounded runtime rounded to a
minute plus account startup allowance, within the account maximum.

Admission, reservation, execution intent, completed results and replay commit
through the actor journal. A completed identical request returns the stored
result without another charge. A changed command plan with the same ID is
rejected. Only a definitive `BackendUnavailableError` before allocation permits
automatic fallback; unknown launch, interrupted execution or unconfirmed stop
retains an `uncertain` reservation. Ordinary command failure never retries
side effects on another provider. On process startup call `store.recover()`
with current ISO time before accepting commands.
Recovery cancels native reservations that never recorded launch intent so they
can be admitted against current policy; interrupted running leases remain uncertain.

The root entrypoint and scheduler target Node. Cloudflare Workers import the
portable `@hobo/ci/execution` entrypoint, which has no Node ledger or Dispatcher
imports. Budget admission belongs to the authenticated control plane before
the Worker pipeline starts. Native adapters execute inside their explicitly
bound engine/workspace; the Node relay does not become a vendor runner.

Run `pnpm --filter @hobo/ci-gh-actions act:install --directory /tmp/hobo-ci-tools`
and `pnpm --filter @hobo/ci-gh-actions test:act --act /tmp/hobo-ci-tools/act`
for actual local workflow execution. See its `act/README.md` for evidence and
boundary details. The ordinary test lane includes the cross-backend command
corpus, budget policy regressions and the SDK protocol contracts.
