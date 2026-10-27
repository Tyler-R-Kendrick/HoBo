# HoBo.CI production delivery

The original SDK delivery (#1594, closed by #1595) established the routing and
portable execution contracts. The production continuation (#1596) added the
deployable Linux relay and an executable local acceptance path. A reachable
managed service still requires independent hosting, durable infrastructure,
App provisioning and provider Connections before workflows depend on it.
The target remains one-line workflow authoring: `runs-on: hobo` after onboarding.

The user selected Vercel Functions/Services for managed relay hosting. See the
[hosting and SDK policy plan](hosting-and-policy-plan.md) for the selected
HTTP/database/queue architecture, alternatives, adversarial findings, proposed
SDK configuration and implementation acceptance gates.

## Implemented production path

- Account-authenticated generated HTTP API and typed client for policy, GitHub
  installations, repository setup, status and reconciliation.
- Revisioned SQLite policy and setup operation journal. Updates survive restart;
  CAS prevents lost writes, active leases fence identity changes and account
  reads/mutations remain isolated.
- Repository-ID/default-branch discovery, App/installation authority verification,
  server-created reviewed plans, idempotent setup branches/PRs and verified merged
  bootstrap bytes. Ready connections require a locked administrator-protected pin.
- Linux Node24 service lifecycle, bounded HTTP/probe/drain, per-lease error
  isolation, local readiness, secret-file bindings and process-lifetime OS lock.
- Nonroot Compose/Kubernetes deployment assets, persistent volume, read-only root,
  online WAL backup, locked offline restore, integrity checks and crash recovery.
- Private repositories with a repository-wide trusted-workload boundary; public
  repositories and fork/PR provisioning are refused by the workflow bridge.
  Revocation during asynchronous intake, dispatch or JIT checks cannot admit
  work under the old branch/event rules.
- Lowest projected cost after applicable free allocations across GitHub, Blacksmith, Depot,
  WarpBuild and isolated Kubernetes host labels. Fresh complete usage snapshots
  can be published through policy without restart. Inclusive usage watermarks
  prevent late reconciliation from duplicating observed spend/free consumption.
- Station integration with actual Broker budget facts: highest-active-threshold
  offer profiles, recovery, explicit pause, persisted replay ordering and CAS.
  Existing jobs retain their reservation; new admissions use current eligibility.
- Process-group shutdown acknowledgment, repeated cancellation handling,
  paginated discovery and account-scoped verified reconciliation.
- Manual GitHub acceptance recipe: literal `runs-on: hobo`, pinned actions,
  bounded runtime and actual runner/repository/ref/SHA evidence. Other preserved
  hosted CI remains disabled.

The runtime launches original GitHub jobs through the reviewed host workflow/JIT
protocol. Provider-native VM APIs are not assumed. Portable Actions, Dagger and
Cloudflare command backends retain their shared contract and budget ledger.

## Test now

```sh
pnpm exec turbo run build --filter=@hobo/ci-gh-actions --concurrency=100%
pnpm --filter @hobo/ci-gh-actions act:install --directory /tmp/hobo-ci-tools
pnpm --filter @hobo/ci-gh-actions test:acceptance --act /tmp/hobo-ci-tools/act --evidence /tmp/hobo-ci-acceptance
pnpm --filter @hobo/ci-gh-actions deploy:check
```

Connected local acceptance executes seven original jobs through signed HTTP,
reservation, dispatch, RS256/OIDC/JIT, the shipped host launcher, real act jobs,
completion and settlement. Five providers' free minutes are consumed before paid
routing; provider budget then forces fallback; account exhaustion starts no job.
Reopen/replay preserves the ledger. Three actual fault runs reject missing JIT,
provider mismatch and skipped work. Older forty-job act scenarios remain available
through `test:act` for matrix, outputs and dependency semantics.

TypeScript, generated protobuf/CUE, shared routing/recovery regressions, SDK/App
and HTTP Pacts, real POSIX process tests, workflow-policy negative controls and
actual nonroot container lifecycle checks protect the implementation. The
container checks authenticated policy/CAS/tenant isolation, owner fencing,
SIGTERM, same-volume persistence, online backup and read-only-input restore.

See [the service quickstart](../../../packages/ci-gh-actions/README.md),
[deployment](../../../packages/ci-gh-actions/deploy/README.md) and
[acceptance boundaries](../../../packages/ci-gh-actions/acceptance/README.md).

## Release evidence

Local execution, protocol compliance and deployable image behavior are recorded
separately from live GitHub/vendor execution. The connected credential returned
HTTP403 for this repository's runner-management API. Automatic approval review
also rejected a subsequent optional live permission probe under the earlier
monorepo-only contract-test scope. No successful live runner result is claimed.
A real release acceptance requires the actual installed App, public HTTPS relay,
provider accounts/labels and execution of the manual HoBo workflow. GitHub must
first discover that workflow on the default branch before dispatching a branch.

The service's health/readiness endpoints establish local partition operation;
they are not provider acceptance attestations. Unknown allocations or unconfirmed
shutdown retain reservations. Restoring an older backup is offline recovery and
requires fencing and reconciliation of post-backup provider activity before
resuming admission; it is not automatic failover.
