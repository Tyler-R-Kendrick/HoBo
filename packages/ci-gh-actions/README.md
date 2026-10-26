# HoBo CI gh-actions

`@hobo/ci-gh-actions` implements an **experimental, locally tested** hosted relay
for the original GitHub Actions job selected by `runs-on: hobo`. Live provider
execution has not been verified. The account/repository onboarding UI, Station/Broker
service integration and hosted deployment are not shipped by this change.

The relay receives signed GitHub App webhooks, resolves an installed repository to
its HoBo account, reserves budget and starts an account-owned provider host. That
host obtains a single-use JIT runner configuration using GitHub OIDC and runs the
official Actions runner with the `hobo` label. GitHub assigns the original queued
job to that runner; its original workflow remains the source of truth.

| Provider | Current execution path | Readiness |
| --- | --- | --- |
| GitHub | Companion workflow on an explicitly configured GitHub-hosted label | Experimental bridge |
| Blacksmith | Companion workflow on an account-connected Blacksmith label | Experimental bridge |
| Depot | Companion workflow on an account-connected Depot label | Experimental bridge |
| WarpBuild | Companion workflow on an account-connected WarpBuild label | Experimental bridge |
| Kubernetes | Companion workflow on operator-owned isolated ephemeral host runners | Experimental bridge; direct pod adapter deferred |

These vendors are independent providers. The relay does not assume a public vendor
API accepts arbitrary GitHub JIT credentials. Bridge compatibility, provider terms,
isolation and actual usage must be tested in the customer's own accounts before
setting `enabled` and `bridgeAcknowledged`. Existing `@hobo/runner-*` packages dispatch
separate workflows and are not used to impersonate original-job execution here.

## Connect a repository once

1. Deploy this relay with Node 24+, a persistent local SQLite volume and an HTTPS
   origin. Run one active relay process per database partition. Do not mount a WAL
   database across multiple machines. Publish `/github/webhooks` and `/v1/leases/*/jit`.
2. Create/install a HoBo GitHub App on the selected repository. Subscribe to
   `workflow_job` and `workflow_run`; give repository **Actions: read/write**,
   **Administration: read/write** (repository runner JIT registration/deletion), and
   Metadata read. App-installation/repository ownership must be established in the
   HoBo platform before writing a Connection. The relay has no public connection
   mutation API. Record the installation ID, repository ID, and the App bot's actor
   user ID (`dispatcherActorId`, not the App ID).
3. Copy [`templates/hobo-ci-host.yml`](templates/hobo-ci-host.yml) to the connected
   repo's `.github/workflows/hobo-ci-host.yml`. Copy [`src/bootstrap.ts`](src/bootstrap.ts)
   to `.hobo-ci/bootstrap.ts`. Merge both to its default branch so GitHub enables
   `workflow_dispatch`. Create a protected tag for that reviewed commit. Configure
   `bridgeRef` as that tag and `bridgeSha` as its 40-character commit SHA. Both are
   checked: GitHub dispatch requires a branch/tag; OIDC and REST verification require
   the pinned code. Updating bootstrap or its runner version requires a new reviewed
   commit, tag and SHA.
4. Set repository variable `HOBO_CI_RELAY_URL` to the relay's HTTPS origin. Connect
   the provider accounts to GitHub and use their actual supported Linux x64 labels.
   Kubernetes host runners must be disposable, isolated and have required runner
   system libraries installed. Every eligible host needs outbound access to GitHub
   and the relay. Node setup and runner download occur inside the reserved host time.
5. Create configuration using [`examples/config.json`](examples/config.json). All
   offers in the example are disabled and stale. Enter verified usage evidence,
   rates, budgets, trusted refs and real IDs; acknowledge bridge readiness only after
   live acceptance. `runnerGroupId` must be the repository runner group accepted by
   GitHub's JIT endpoint for this installation (often 1; verify rather than assume).
6. Set relay environment and build/start it:

   ```sh
   HOBO_CI_CONFIG=/data/ci-config.json
   HOBO_CI_DB=/data/ci.sqlite
   HOBO_CI_PUBLIC_URL=https://ci.example.com
   HOBO_CI_GITHUB_APP_ID=your-app-id
   HOBO_CI_GITHUB_APP_KEY_FILE=/run/secrets/github-app.pem
   HOBO_CI_WEBHOOK_SECRET=your-high-entropy-webhook-secret-at-least-32-characters
   # Export these in your deployment's secret/config binding, then:
   pnpm exec turbo run build --filter @hobo/ci-gh-actions... --concurrency=100%
   pnpm --filter @hobo/ci-gh-actions start
   ```

   Default listen address is `127.0.0.1:8787`; set `HOBO_CI_HOST` and `HOBO_CI_PORT`
   for your reverse proxy/container. TLS terminates at that proxy. Installation
   tokens are minted only inside the relay; workflows receive only JIT material.
   An injected `GithubTransport` can use the HoBo Broker instead of a local App key.
7. User workflows now change one line:

   ```yaml
   jobs:
     test:
       runs-on: hobo
       steps:
         - uses: actions/checkout@v4
         - run: npm test
   ```

## Trust and routing limits

Initial scope is **trusted private repositories, Linux x64, bare `hobo`, push or
workflow_dispatch, explicitly allowed branches**. Public repositories and fork/PR
provisioning are refused. All workflows capable of queuing `hobo` jobs in a connected
repository must be trusted; all writers who can change/dispatch the companion
workflow must be trusted CI/billing administrators. `trustedRepositoryAcknowledged`
is mandatory. Branch/event checks control provisioning; they do not constrain
GitHub's eventual runner assignment. GitHub can assign any compatible queued job to
a repo-scoped `hobo` runner, including an otherwise ignored workflow. Bare labels
cannot enforce per-job trust, machine selection or branch isolation. Use separate
repositories/runner-group workflow policies before supporting untrusted workloads.

The host App-bot identity, repository, run attempt, workflow path/SHA, lease title,
OIDC audience and provider label are checked before JIT registration. JIT cannot be
claimed twice. Bootstrap verifies the runner archive checksum, masks JIT material,
forwards cancellation to the child process group, and passes an explicit environment
allowlist to avoid outer `GITHUB_*`, `RUNNER_*` and credential inheritance. The child
shares a machine with its host workflow; this is why repository-wide trust and
provider isolation acceptance are required.

Routing reserves `maxRuntimeMinutes + startupMinutes`, then holds that reservation
until REST verifies that the outer `host` job stopped and runner cleanup succeeded.
Original-job completion only records actual runner/job attribution. Settlement uses
the outer job's start/end, rounded up, and the price pinned in its lease. It includes
startup, idle and cleanup; it excludes provider queue delay. These are routing usage
estimates, not provider invoices. Unknown/stale headroom is never assumed free.
Budgets apply at job admission; a running job is not migrated mid-execution.

## Recovery and validation

The worker drains pending jobs and outbox intents every five seconds. Duplicate
webhooks do not duplicate leases. SQLite events and projections commit atomically.
Restart changes interrupted dispatch/claim intents to `uncertain`. Uncertain launches
are never blindly retried or released by age. The worker discovers completed hosts
among the latest 100 companion runs and polls known host IDs; `workflow_run` completion
webhooks also reconcile them. Older/ambiguous launches require an operator to identify
the unique App-dispatched host run and invoke the SDK's `relay.reconcile(leaseId, runId)`.
No host means **retain reservation** until its absence has been independently proved;
this version deliberately provides no force-release HTTP endpoint. Back up the DB,
keep configuration offer identities stable while leases are active, and retain
journal history. `LeaseStore.rebuild()` reconstructs query projections from events.

Run package `build`, `typecheck`, `test`, `lint`, shared `codegen:check -- --filter packages/ci`,
and the repository's relevant gates. Tests cover signed intake, real local HTTP,
RS256 identities, budgets, races, crash recovery, JIT single use and provider request
contracts. They use simulated dependencies. They do not prove live provider acceptance.
The live release checklist is [the implementation plan](../../docs/plans/hobo-ci/README.md).

When a runner executes another queued job, reconciliation independently checks
its planned job and atomically requeues unmet demand after settling the host.
Historical leases do not suppress replacement capacity; terminal tombstones and
active reservations still deduplicate repeated delivery. Pre-launch evidence,
prices and budgets are rechecked; stale unlaunched demand is safely readmitted.
A delayed host cannot claim JIT after its free evidence becomes stale. If a provider
starts a queued host after the credit window ends, bootstrap can still incur cost;
settlement conservatively treats usage outside the pinned window as paid. Provider
spend controls and native queue cancellation are required for an external billing
ceiling. The current relay enforces budget admission using configured evidence.
