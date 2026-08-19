---
type: Reference
title: "Live provider readiness matrix"
description: "Honest matrix of production cloud/CI/IaC adapters: realize vs apply, credential gates, and what is still mock/in-memory. Complements ship residual H-E5."
tags: [hobo, design, providers, honesty]
---

# Live provider readiness matrix

> **Purpose.** Stop reading “package exists” as “live multi-cloud apply works.”  
> **Residual:** full multi-cloud live apply remains **H-E5** in
> [`instances/residual-human-blockers-2026-07-30.md`](./instances/residual-human-blockers-2026-07-30.md).  
> **Default product lane:** in-memory Pulumi stand-in via `@hobo/hobo` compose (HONEST SCOPE).

## Legend

| Level | Meaning |
|---|---|
| **IR / realize** | Emits `hobo.iac-program/v1` (or equivalent) — no cloud API call |
| **Cred-gated apply** | Live HTTP/API path when tokens present; offline otherwise |
| **In-memory** | Deterministic offline stand-in (default for plan/up) |
| **Stub** | Explicit unimplemented refuse |

## Cloud providers (`packages/providers/`)

| Adapter | Realize IR | Live apply | Notes |
|---|---|---|---|
| `@hobo/provider-cloudflare` | Yes | **Anonymous temporary** | Temporary Accounts (`provisionTemporaryEnvironmentStation`); composed permanent-token deploy stays operator-only; OpenSaaS Examples `db` Bindle realized via **Neon Claimable Postgres** (`POST neon.new/api/v1/database`, zero keys; mock with `HOBO_OPENSAAS_DB_MOCK=1`); OpenSaaS anon server host chain = OpenPouch HTTP one-shot → **Clawdship** Docker competitor → CF Temporary Neon HTTP shim (`HOBO_OPENSAAS_SERVER_HOST=auto\|cloudflare\|openpouch\|clawdship`, mock `HOBO_OPENSAAS_SERVER_MOCK=1`; adapters in `site/scripts/anon-container-hosts/`; competitor doc [`docs/competitors/anon-container-hosts.md`](../competitors/anon-container-hosts.md)) |
| `@hobo/provider-lakebed` | Yes | **Anonymous temporary** | Deploy-driver (ADR-0127) + anonymous `lakebed deploy` / injectable transport — **never** `LAKEBED_TOKEN` on Examples path |
| `@hobo/provider-vercel` | Yes | **Vercel Drop** | [Drop](https://vercel.com/docs/drop): new project per stamp; Examples `/api/vercel-temp` (mock/`vercel login` session — **never** permanent `VERCEL_TOKEN`) |
| `@hobo/provider-netlify` | Yes | **Anonymous CLI / Drop** | `netlify deploy --allow-anonymous` (+ injectable transport); Examples `/api/provider-temp/netlify` (`HOBO_NETLIFY_TEMP_MOCK=1` for CI — **never** `NETLIFY_AUTH_TOKEN`) |
| `@hobo/provider-browser-wasm` | Yes | Local temporary | Examples same-origin `/api/anon/host/*` via `/api/provider-temp/browser-wasm` |
| `@hobo/provider-webernetes` | Yes | Local temporary | Examples same-origin `/api/anon/host/*` via `/api/provider-temp/webernetes` |
| `@hobo/provider-kubernetes` | Yes | Cred-gated / local | Placement driver reaches a real apiserver (injected transport, `kubectl proxy` opt-in). Also ships convergent apiserver `ResourceResolver`s for **all 9** catalog product ids (Deployment, StatefulSet, DaemonSet, Job, CronJob, Service, Ingress, PVC, Secret) — **fake-transport proof only**. The Secret's contents arrive through the injected `resolveSecretData(logicalId)` and never through `desired`; outputs publish the key names and the `k8s://` locator, never a value, and a rotation converges by comparing encoded values in memory so neither version is rendered anywhere. `realize()` emits `hobo.iac-program/v1` (the old driver document stays as `kubernetesDriverProgram()`). Catalog is built-ins only — `data`/`kv`/`queue`/`topic` need operators. **Not** an Examples OOB station target |
| `@hobo/provider-aws` | Yes | No default | IR only unless wired through live IaC engine. Ships SigV4-signed `ResourceResolver`s for **7 of 19** catalog product ids (`AWS_RESOLVED_PRODUCT_IDS`) — **fake-transport proof only**, no live call, and no Resource Definitions registered, so a deploy still fails closed |
| `@hobo/provider-gcp` | Yes | No default | IR only. Ships HTTP `ResourceResolver`s for **9 of 14** catalog product ids (`GCP_RESOLVED_PRODUCT_IDS`) — **fake-transport proof only**, no live call, and no Resource Definitions registered, so a deploy still fails closed |
| `@hobo/provider-azure` | Yes | No default | IR only. Ships ARM `ResourceResolver`s for **9 of 16** catalog product ids (`AZURE_RESOLVED_PRODUCT_IDS`) — **fake-transport proof only**, no live call, and no Resource Definitions registered, so a deploy still fails closed |
| `@hobo/provider-digitalocean` | Yes | No default | IR only. Ships `ResourceResolver`s for **14 of 15** catalog product ids (`DIGITALOCEAN_RESOLVED_PRODUCT_IDS`) — bearer-token against `api.digitalocean.com/v2`, plus **Spaces over SigV4** on its own guarded host with its own key pair. App Platform workers and jobs converge by **read-modify-write on the owning app's spec** (`PUT /v2/apps/{id}`); they never create the app, and everything they do not own is carried through the write. **Fake-transport proof only**, no live call, and no Resource Definitions registered, so a deploy still fails closed. The 1 without a resolver is Functions: DigitalOcean's v2 API has **no function resource** — only `/v2/functions/namespaces`, its triggers and its keys — and deploying a function is a source upload to a per-namespace host, which is a build pipeline rather than a convergent create. `queue`/`topic`/`secretRef` carry no rows: DigitalOcean sells no first-party queue or secret store |
| `@hobo/provider-hetzner` | Yes | No default | IR only. Ships `ResourceResolver`s for **all 5** catalog product ids (`HETZNER_RESOLVED_PRODUCT_IDS`) across three guarded hosts: Cloud Server, Load Balancer and Volume on `api.hetzner.cloud/v1`; **Object Storage over SigV4** on `<location>.your-objectstorage.com`; and the **Storage Box on `api.hetzner.com/v1`**, the unified host Hetzner moved it to, with the same bearer-token scheme as the Cloud API. Its create password arrives through the injected `resolveStorageBoxPassword(logicalId)` and never through `desired`. **Fake-transport proof only**. Robot (`HETZNER_EXCLUDED_SURFACES`) stays unreachable — dedicated-server administration behind the web console password, which nothing catalogued here needs. Five slots carry no rows — no managed database, cache, queue, topic or secret store |
| `@hobo/provider-hostinger` | Yes | **Adopt-only** | IR only. Ships `ResourceResolver`s for **all 5** catalog product ids (`HOSTINGER_RESOLVED_PRODUCT_IDS`): VPS and DNS zone on `/api/vps/v1/` and `/api/dns/v1/`, and web hosting, static site and MySQL on `/api/hosting/v1/`. Buying stays impossible: the guard does not allowlist `/api/billing/v1/`, a VPS is adopt-only, and a website create requires `desired.orderId` — a plan the account already owns. `delete()` on a VPS refuses (it would cancel a paid plan). The MySQL user password arrives through the injected `resolveDatabasePassword(logicalId)`, never through `desired`. **Fake-transport proof only** |
| `@hobo/provider-kafka` | Capability | N/A messaging | Not a full cloud Yard provider |
| `@hobo/provider-convex` | Yes | Cred-gated + Examples | `realize` → `applyDriverProgram`; Cloudflare Examples frontend = Temporary Pages; **anon Temporary Convex self-host fail-closed** under zero project API keys (`provisionConvexBackendAnonymous` rejection matrix: Instanode no anon containers, OpenPouch anon 256MiB cgroup, CF Temporary Containers 403); mock via `HOBO_CONVEX_SWAGHAUS_MOCK=1`; escapes `HOBO_CONVEX_OCI_HOST=cloudflare` / `HOBO_CONVEX_ALLOW_CLOUD=1`; WorkOS AuthKit for swaghaus; `/api/cf-temp/swaghaus` |
| `@hobo/provider-ax` / `agentv` | Eval | N/A | AI-eval adapters |

Shared temp contract: `hobo.temporary-environment-station/v1` in `@hobo/core` (`temporaryStationToAnonymousSessionShape` aligns with broker `AnonymousSessionResult`).

## IaC engines (`packages/iac/`)

| Adapter | Default | Live |
|---|---|---|
| `@hobo/iac-pulumi` | **In-memory** Automation stand-in | `HOBO_PULUMI_LIVE=1` (+ engine binary/module) |
| `@hobo/iac-terraform` | Offline/test | CLI engine when binary present |
| `@hobo/iac-crossplane` | Offline/test | Cluster-gated |

## Runtimes

| Runtime | Status |
|---|---|
| `runtime-local` | Default durable SQLite Camp |
| `runtime-wasm` | Real Wasmtime path when toolchain present |
| `runtime-oci` | kubectl transport when cluster available |
| `runtime-cloud-native` | **Stub** providers (`HOBO_CLOUD_NATIVE_UNIMPLEMENTED`) |
| `runtime-dapr` / `runtime-browser` | Specialized |

## Traffic-routing staging cutover lane (`pnpm run staging:cutover`)

The Phase-5 transparency demo: `scripts/staging-cutover-demo.mts` drives the
production control loop (`@hobo/stations`) + progressive cutover through a real
adapter while an external uptime probe (default 1 req/s) watches the public
URL. The verdict (event trace, probe log, success rate) is archived under
[`instances/staging-cutover/`](./instances/staging-cutover/). Only the adapter
binding changes between lanes — the swap logic is identical.

| Lane | Binding | Gate | Status |
|---|---|---|---|
| `--provider=simple` | Loopback backends + routing proxy | none | **Green** — archived run: 100% probe success across a budget-driven 10→50→100 swap |
| `--provider=vercel` | Rolling Release canary between two mapped deployments | `VERCEL_TOKEN`, `VERCEL_PROJECT`, `VERCEL_DEPLOYMENT_A/B`, `HOBO_STAGING_PROBE_URL` | Cred-gated; fails closed (exit 2) without env |
| `--provider=cloudflare` | LB pools + health checks on a staging zone | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_ACCOUNT_ID`, `HOBO_STAGING_BACKEND_A/B`, `HOBO_STAGING_PROBE_URL` | Cred-gated; fails closed (exit 2) without env |

Success requires `reapplied` **and** zero failed probe samples; any probe
failure exits non-zero and the archived evidence names the failing samples.

## Operator takeaway

1. **Offline dogfood:** hello-bindle + self-host-yard + self-host-station — no cloud account.  
2. **First live cloud:** credential-gated CF/Vercel / Pulumi live flags — still not “unedited Bindle on N clouds.”  
3. **S4 multi-cloud GA:** blocked on H-E5 + H-V1 CI + dogfood residuals.

## Maintenance

Update this matrix when a provider graduates from IR-only to default-offline-safe live apply with tests. Do not mark live without a fail-closed no-credential test and a credentialed lane doc.
