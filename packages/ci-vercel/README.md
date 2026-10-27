# HoBo CI Vercel relay

This package provides a Vercel Node Function HTTP boundary, a Postgres-backed
relay, a private queue consumer, and an independent scheduler. Signed
GitHub deliveries are committed before acknowledgement. Queue notifications
wake the worker immediately; the scheduler recovers committed work whose wakeup
was lost and asks GitHub to redeliver failed App deliveries. `/readyz` requires
the database, queue, scheduler and GitHub repair path to have recently succeeded;
a new deployment reports unready until its first repair scan completes. A
successful partial scan retains the last completed-scan health while it queues
its continuation. Actual scan failures mark the relay unready, and completed-scan
health expires after 45 minutes. Delivery and queued-job scanners record their
completed cycles independently, since their pagination can finish on different
wakeups. A new deployment waits for both scanners to complete; a queued scan
may wait for the existing ten-minute cooldown. This is scanner liveness, not a
point-in-time guarantee that every repository is covered after inventory changes.
The webhook intake is available during initial repair.

The queue uses **parse, don't validate**: `QueueMessageSchema` parses provider
input into derived types for a committed-delivery wakeup, a scheduled or
continuation repair, or the authenticated manual-tick command. The protobuf and
CUE definitions in [data-models](data-models/) describe the queue messages and
their constraints; provider-supplied metadata does not become routing authority.

The GitHub App and Vercel scheduler are actors that submit commands through the
signed HTTP intake or private queue. The PostgreSQL event-store records CI events
and the durable webhook inbox; lease and configuration projections are its
materialized views. Worker health is a separate PostgreSQL read store recording
the latest successful and failed processing times. The Vercel function is
stateless: it reads the current policy snapshot from PostgreSQL on each operation,
and never treats a process-local cache or a queue wakeup as the event-store.

A scheduler calls the authenticated repair endpoint every 15 minutes; it submits
a repair message to the private queue. Normal work uses an immediate queue
wakeup. The HoBo deployment uses a Neon scheduled trigger; operators using Vercel
Cron must configure it explicitly and observe their plan's schedule limits. The
queue schedules a delayed continuation for larger delivery histories.

Production queue messages stay pinned to their publishing deployment. Each
new callback forwards a validated wakeup to the canonical relay and acknowledges
it only after the current worker succeeds. Keep the canonical URL and the
broker-held `CRON_SECRET` stable while those messages can be retried. The
handoff does not change callbacks from deployments predating this mechanism;
retire or drain those separately. Messages expire after one hour, while the
database inbox remains the source of truth for recovery.
Vercel's Hobby plan is limited to personal, non-commercial use. PostgreSQL,
queue operations and Functions can incur usage charges according to the chosen
plans. A temporary deployment or Vercel Drop alone is not a durable inbound App
endpoint.

Node 24 is required. Bootstrap mode uses these Vercel secret bindings:

- `DATABASE_URL`: a PostgreSQL connection, preferably pooled.
- `DATABASE_URL_UNPOOLED`: a direct connection to the same PostgreSQL database
  and role, required after GitHub App bootstrap. Repair scanners hold session
  advisory locks across requests; transaction-pooling endpoints cannot provide
  this guarantee. Neon supplies both variables through its Vercel integration.
  Neon pooler URLs are rejected for the direct connection. Each repair checks
  the two connections against a committed random database marker before using
  it. For other providers, the operator must supply a true direct endpoint.
  A repair invocation opens at most one direct connection and closes it after
  use. Concurrent repair invocations each require a separate connection; there
  is no global concurrency cap, so database connection limits constrain scale.
- `HOBO_CI_PUBLIC_URL`: the stable HTTPS origin used by GitHub.
- `HOBO_CI_SESSION_KEY`: a canonical, unpadded base64url encoding of 32 random bytes.
- `HOBO_CI_BOOTSTRAP_ACCOUNT_ID` and `HOBO_CI_BOOTSTRAP_TOKEN_SHA256`: the owner
  account and lowercase SHA-256 digest of its distinct bootstrap bearer token.
- `HOBO_CI_CONTROL_TOKENS_JSON` and `HOBO_CI_CONFIG_JSON`: trusted control tokens
  and the initial account/provider configuration. The configuration seeds only
  an empty ledger and does not replace later changes.

`CRON_SECRET` is required and must be at least 32 bytes. The scheduler sends it
as `Authorization: Bearer <secret>` to `GET /internal/tick`; the endpoint only
queues repair, and the private consumer records schedule health after processing.
The queue handoff uses the same server-side credential for its authenticated
`POST /internal/queue-wakeup`; the credential never appears in the payload.
In bootstrap mode, do not set App ID, private
key or webhook secret: those are saved in the encrypted vault after the GitHub
App manifest flow. See [GitHub onboarding](../ci-gh-actions/ONBOARDING.md). For an
existing App, provide `HOBO_CI_GITHUB_APP_ID`, `HOBO_CI_GITHUB_APP_PRIVATE_KEY`,
and `HOBO_CI_WEBHOOK_SECRET`. Adding `HOBO_CI_GITHUB_APP_CLIENT_ID`,
`HOBO_CI_GITHUB_APP_CLIENT_SECRET` and `HOBO_CI_SESSION_KEY` enables browser
installation; these three settings must be supplied together.

The reviewed sibling `ci-gh-actions` workflow and bootstrap files are embedded
into the build by `scripts/generate-assets.mts`; a contract test verifies their
contents match the sources. A deployment must verify rewrites, the private queue
trigger and scheduler before production use. Contract tests run without live
GitHub or Vercel credentials.

The isolated Sandbox runner integration is configured via
`HOBO_CI_SANDBOX_ENABLED=1`, `HOBO_CI_SANDBOX_TEAM_ID`,
`HOBO_CI_SANDBOX_PROJECT_ID`, `HOBO_CI_SANDBOX_ISSUER` (the pinned Vercel
team issuer), and `HOBO_CI_SANDBOX_DOMAINS_JSON`
(an explicit hostname allowlist). GitHub runner setup, checkout, Node setup,
and artifact transfer can require `github.com`, `api.github.com`,
`codeload.github.com`, `raw.githubusercontent.com`, `nodejs.org`,
`release-assets.githubusercontent.com`, `*.actions.githubusercontent.com`,
and `*.blob.core.windows.net`. Add the hosts used by each workflow's own
dependencies and redirect targets; this list does not cover every workflow.
The only permitted wildcard patterns are
`*.actions.githubusercontent.com` and `*.blob.core.windows.net`, which GitHub
documents for runner traffic. The Azure Blob suffix includes third-party storage
accounts; enabling it permits job traffic to those accounts as well.
`HOBO_CI_SANDBOX_PLAN` defaults to `hobby`. It requires a
matching two-VM Sandbox offer with current pricing and allocation evidence. The
proxy also accepts Vercel's global issuer and the exact team-ID issuer when the
signed token matches the expected audience, team, project, and bound Sandbox.
It does not accept another team's issuer path.
The implementation creates a temporary proxy VM before the runner VM and stops both
after the job. It downloads and verifies the runner archive before uploading it to
the runner VM. Both VMs, their network usage, and quota-control calls are
included in the reservation and settlement estimate.

Live production testing has registered a JIT runner, assigned a GitHub job to
it, and passed job setup; the full checkout and artifact workflow is still
being verified. Live Sandbox tests on a Pro team also verified 16 MiB transfers
through an exposed port and matched forwarding identity claims to the guest
session; see [Sandbox egress](SANDBOX-EGRESS.md). The gateway's maximum transfer
size remains unverified.
The Vercel runtime admits isolated jobs only when Sandbox is explicitly configured;
without it, readiness remains false and isolated jobs are not launched. Recovery
first fences in-flight launch states and retains ambiguous create
or registration outcomes until their identities can be recovered. It also denies
the nonisolated workflow bridge because repository visibility
could change after a shared-label runner is registered. The readiness endpoint
also requires recent worker health. The
direct Function proxy is disabled in this production composition; the separate
proxy VM handles Sandbox traffic.

The proxy byte quota is not a hard limit on the provider bill. Traffic to the
public proxy port can be billed before authentication, and network overhead,
provider metering and Function usage can differ from the estimate. CPU usage
is charged conservatively because the provider has not documented the
aggregation of its CPU metric.

Once both Sandboxes have stopped, their measured usage is available, and runner
deletion is confirmed, the relay settles the cost even if assignment is unknown;
later GitHub observations can attach the job without declaring the runner idle.
After an ambiguous GitHub JIT registration, the relay looks for the unique runner by its
deterministic name and deletes it before settling. An absent or ambiguous
lookup holds the reservation because the original request could still finish;
there is no automated operator resolution for that case yet. A VM whose create response was lost is
looked up by deterministic name and stopped; the reservation stays held until
its identity, termination and usage are proven.
