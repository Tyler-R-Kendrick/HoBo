# HoBo.CI implementation plan

GitHub Actions is the first executable target. Logical sibling SDKs live in the
existing workspace: `@hobo/ci`, `@hobo/ci-gh-actions`, `@hobo/ci-dagger`, `@hobo/ci-cf`.
Dagger and Cloudflare CI are explicit scaffolds until their execution adapters ship.

1. Protobuf-first shared contracts, CUE fixtures, parsed configuration, deterministic
   routing using the existing `@hobo/dispatcher`, hard budget eligibility checks.
2. GitHub App signed `workflow_job` intake; account/repository binding; transactional
   SQLite journal, lease projections and outbox. Never replay an ambiguous launch.
3. Opt-in provider bridge adapters for GitHub, Blacksmith, Depot, WarpBuild and
   operator-owned Kubernetes runners. Each companion workflow hosts a fresh JIT
   runner labeled `hobo`, so the original workflow keeps GitHub semantics.
4. RS256 GitHub OIDC bootstrap, repository/workflow SHA/run binding, short-lived
   JIT credentials. No installation token in a workflow or job.
5. Reserve the full host timeout, consume usable free allocation before paid cost,
   enforce account/provider budgets and concurrency, settle only after host stops.
6. Contract tests over real local HTTP, signed webhook tests, replay/restart and
   concurrent intake tests; typecheck, codegen/CUE drift, package and relevant gates.
7. Live acceptance requires a deployed HTTPS relay, GitHub App installation and
   customer-owned provider accounts. Record measured entitlement and host usage.
   No provider is live-verified by mocked API tests.

Constraints: GitHub has no API to rewrite queued `runs-on`. Managed runner vendors
expose their own labels; a bridge is an experimental compatibility route requiring
provider support and acceptance. Bare `hobo` cannot bind a runner to a job ID;
initial routing is repository-wide homogeneous Linux x64 policy, accounting follows
actual runner identity. No claim of exact per-job routing. Public/fork/untrusted refs
are refused for provisioning; GitHub assignment still requires repository-wide trust. Ambiguous operations keep reservations until reconciled. A provider's
advertised free plan is never used as an available account entitlement.

Deferred production work: platform Station/Broker provisioning and entitlement feeds,
HA partition workers, native vendor provisioning contracts, Kubernetes direct pod
adapter, richer OS/architecture classes, automatic App onboarding UI and release
publishing, Dagger/Cloudflare executors. Bridge mode requires a one-time trusted
companion workflow; ongoing user workflows change only `runs-on: hobo`.

## Future deployment acceptance (outside this monorepo change)

The local implementation and contracts can be reviewed without credentials. Before
calling hosted routing working, execute and retain evidence for every step below:

- Select a private repository where every possible `hobo` workflow is trusted.
  Connect it to a HoBo account with verified GitHub installation/repository IDs.
- Deploy the Node relay behind HTTPS with a persistent volume and App secret bindings;
  confirm webhook HMAC delivery and App bot identity. No secrets belong in this repo.
- Install/review the companion workflow and bootstrap; dispatch a protected tag and
  pin its SHA. Confirm OIDC's real workflow_sha/workflow_ref and runner-group behavior.
- Enable one provider, set measured allocation and a zero paid budget, run an original
  `runs-on: hobo` job. Save original run/job ID, outer run/job ID and actual runner name.
- Repeat for GitHub, Blacksmith, Depot and WarpBuild after checking their bridge
  compatibility and account terms. For Kubernetes use a fresh isolated host per job.
- Exhaust a small configured free balance across two providers; show free fallback,
  then the cheapest eligible paid offer using a deliberately bounded test budget.
- Validate original job logs, artifacts, environment approvals, service/container jobs,
  matrix concurrency and reruns. Check that nested runner process identity/context is
  correct on each host. Only Linux x64 bare `hobo` is promised initially.
- Cancel before launch, during bootstrap and during original execution. Confirm child
  and host shutdown, JIT cleanup, retained reservations and final usage reconciliation.
- Restart after dispatch intent and drop a completion webhook; confirm there is no
  duplicate launch and discovery recovers the unique completed host. Exercise an
  ambiguous outcome outside the latest-100 discovery window with the operator SDK.
- Reconcile host-minute estimates against provider usage and GitHub's applicable fees.
  Import actual entitlements/invoices before production billing claims. Integrate
  existing Station/Broker ownership and budget feeds instead of exposing config edits
  as an unauthenticated onboarding API.

A deployed relay, GitHub App registration/installation, customer-owned provider
accounts, authoritative balances/prices and a private repository are deployment inputs.
They are not required to implement or validate this monorepo change. All provider
verification for this work uses local contracts, cryptographic fixtures and loopback
HTTP. No external App, repository or provider resource is created.


## Monorepo acceptance evidence

- Four SDK packages scaffolded in the existing workspace; GitHub Actions is the
  executable primary target. Dagger and Cloudflare expose explicit planned readiness.
- 130 SDK tests pass: shared CI 21, GitHub Actions 83, Dagger 13, Cloudflare CI 13.
- Signed webhooks, App JWT/token exchange, OIDC, dispatch, JIT registration and HTTP
  responses are verified against hand-authored contracts and local fixtures.
- Budget admission, free-first routing, all five configured provider bridges,
  concurrent intake, journal replay, lost responses, cancellation, refreshed
  entitlement evidence and displaced-job re-admission have regression coverage.
- `pnpm run agent:check -- --staged`: 17 relevant checks pass, including package
  tests/builds, protobuf/CUE/codegen, architecture, standards, docs and lint.
- Strict targeted TypeScript checking also covers the new tests.

This is a monorepo implementation and contract-validation handoff. The deployment
sequence above documents a later release workflow; it is not an outstanding action
or a request for credentials in this task.
