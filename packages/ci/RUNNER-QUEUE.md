# HoBo runner queue troubleshooting

GitHub shows **`queued`** (no steps, no runner name) when no self-hosted runner with the job’s label is online. HoBo CI jobs use **`runs-on: hobo`**. Those runners are **ephemeral JIT** registrations created by the HoBo CI relay when it admits a `workflow_job` webhook—not long-lived machines sitting in the org runner list.

## Symptom

- Workflow runs stay **`queued`** for minutes or hours (for example **HoBo CI Fabric** on a pull request).
- Manual **HoBo runner acceptance** with `jit_only=true` also queues if the relay is not dispatching.

A successful acceptance run on `main` or a feature branch only proves the relay worked **at that time**; org transfer or disabled providers can break dispatch without changing workflow YAML.

## Root cause checklist (operator)

Work through these on **Hobo-Labs/HoBo** after an org/repo transfer:

### 1. GitHub App + webhooks

- HoBo CI GitHub App must be **installed on the Hobo-Labs org** (or updated) with access to **Hobo-Labs/HoBo**.
- App webhooks must target the **ingress front door** HTTPS origin (`workflow_job`, `workflow_run`), not a relay URL baked into the App settings. The front door reads **`.hobo/ci.json` at the event’s config ref** and forwards signed webhooks to the selected environment’s `relayOrigin`.
- For **local dev and agents behind NAT**, set `jobAdmission: "pull"` on the `local` environment (or rely on default pull inference for loopback relays). Run `hobo ci enable` against `.hobo/ci.json` and start a poll worker (`createJobPollAdmissionWorker`) — no public URL on your laptop.
- **Fork pull requests** never choose a contributor-controlled relay: routing uses the **base-branch** config ref and `selection.forkPullRequestEnvironment` when set.
- Webhook deliveries should be **200/202** in the GitHub App settings; repeated **401/503** means wrong secret or ingress/relay down.

See [`packages/ci-gh-actions/ONBOARDING.md`](../ci-gh-actions/ONBOARDING.md) and [`packages/ci-gh-actions/deploy/README.md`](../ci-gh-actions/deploy/README.md).

### 2. Repository connection (policy)

Runners tied to **`tyler-r-kendrick/HoBo` do not follow a transfer** to **Hobo-Labs/HoBo**. Re-run isolated repository onboarding:

- `connectIsolatedRepository` for **`Hobo-Labs/HoBo`** with required acknowledgments (`trustedRepositoryAcknowledged`, `publicRepositoryAcknowledged`, `acceptAllMatchingRepositoryJobs`).
- Provider offer enabled with current budget/observation evidence.

Without an admitted connection for the **current** repository full name, the relay ignores jobs even when webhooks arrive.

### 3. Isolated host (required for most CI here)

Admission sets **`isolatedRequired`** when the repo is **public**, on **`pull_request`**, or when the connection is isolated-only. That path needs an **isolated JIT host** on the relay—not the standalone Docker relay’s bridge-only mode.

**Paid path:** Vercel Sandbox (`provider: vercel`, `backend: sandbox`) on the hosted relay.

**Free path (budget exhausted):** add a zero-price **`hobo-box-worker`** offer with **`backend: isolated-container`** and `runsOn: hobo-isolated-worker` (see [`packages/ci/data-models/fixtures/valid/isolated-container-offer.json`](../ci/data-models/fixtures/valid/isolated-container-offer.json)). The legacy provider id `kubernetes` is still accepted for the same backend. Routing picks it when Sandbox reservation would exceed **`offer.budgetMicros`**. Launch requires the **isolated worker sidecar** on an operator-owned free VM (Docker + the same `DATABASE_URL` as the relay):

```sh
# On Oracle Always Free / similar (not on Vercel serverless):
export DATABASE_URL=… # same Postgres as hobo-ci.vercel.app
export HOBO_CI_CONFIG_JSON=…
export HOBO_CI_GITHUB_APP_ID=…
export HOBO_CI_GITHUB_APP_PRIVATE_KEY=…
export HOBO_CI_WEBHOOK_SECRET=…
export HOBO_CI_PUBLIC_URL=https://hobo-ci.vercel.app
export HOBO_CI_WORKER_PROVIDER_ACCOUNT_ID=oracle-free-vm
node --import tsx packages/ci-gh-actions/scripts/isolated-worker-daemon.mts
```

Each job runs in a **fresh Docker container** with the official Actions runner JIT (`labels: [hobo]`). This preserves PR isolation without Sandbox spend.

From [`packages/ci-gh-actions/ONBOARDING.md`](../ci-gh-actions/ONBOARDING.md):

> The Vercel composition enables the isolated host only when Sandbox is explicitly configured. Without that configuration, isolated onboarding and dispatch fail closed.

PR CI (**HoBo CI Fabric** on `pull_request`) is always in this bucket for a public repo.

### 4. JIT label contract

- Workflows must use exactly **`runs-on: hobo`** (single label). The relay rejects jobs with extra runner labels.
- Registered JIT runners must match **`hobo-{uuid}`** name pattern (see acceptance workflow).

### 5. Budget and concurrency

Relay returns **`waiting-for-budget-or-capacity`** when account/provider budget or concurrency is exhausted. Check relay logs and policy API; queued GitHub jobs will not start until a reservation succeeds.

### 6. Merge queue (landing, not pickup)

**Merge queue** requires branch protection on `main` with merge queue enabled and required checks including **Main full gate**. That gates **merge** after jobs complete; it does not cause **`queued`** by itself.

Set repository variables **`TURBO_TEAM`** and secret **`TURBO_TOKEN`** for remote Turbo cache (fork PRs use read-only remote mode in workflow).

## Verify end-to-end

1. **`curl --fail https://<relay-origin>/readyz`** — relay healthy.
2. **GitHub → App → Recent deliveries** — `workflow_job` **queued** events succeed when you re-run a stuck workflow.
3. **Manual JIT smoke** (does not need checkout):

   ```sh
   gh workflow run hobo-ci-acceptance.yml --repo Hobo-Labs/HoBo -f jit_only=true
   ```

   Run should leave **`queued`** within ~1–2 minutes if dispatch works; watch runner name **`hobo-…`** in job details.

4. **Live relay acceptance** (admin token, local clone):

   ```sh
   node --import tsx packages/ci-gh-actions/scripts/acceptance.ts --live-verify --repository Hobo-Labs/HoBo
   ```

## What repo CI cannot fix

These require org admin / platform operator action, not a workflow edit:

- Installing or re-pointing the GitHub App after org transfer.
- Relay deploy, secrets, Postgres/SQLite partition, Vercel Sandbox credentials.
- Re-onboarding **Hobo-Labs/HoBo** in relay policy.
- Org/repo **Actions** permissions for fork PRs if you expect fork contributions to run CI.

Workflow YAML in this repository is already **`runs-on: hobo`**; a permanently **`queued`** run means **no JIT runner registered**, almost always because the relay did not admit or launch the job.

## Quick probe (repo script)

```sh
node --import tsx scripts/ci/verify-relay-dispatch.mts
# optional: --relay https://hobo-ci.vercel.app --repository Hobo-Labs/HoBo
```

Exit **0** only when **`GET /readyz`** returns JSON **`{"ready":true}`** (HTTP 200). As of the last operator check, **`https://hobo-ci.vercel.app/healthz`** was **`{"ok":true}`** while **`/readyz`** returned **`{"ready":false}`** — isolated JIT dispatch stays off until readiness clears (Sandbox env, worker health, database — see [`packages/ci-vercel/README.md`](../ci-vercel/README.md)).
