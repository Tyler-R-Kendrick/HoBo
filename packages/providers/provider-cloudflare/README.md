# @hobo/provider-cloudflare

The first concrete HoBo `CloudProvider` (S2-06). It maps provider-neutral
resource plans onto Cloudflare's edge platform and publishes a machine-readable
Capability Manifest.

## Scope (in)

- Initial capability ports: **compute / web-service** (Workers), **kv** (KV),
  **objectStore** (R2)
- Equivalence-class mappings per port (`cloudflare:workers-script`,
  `cloudflare:kv-namespace`, `cloudflare:r2-bucket`)
- `CLOUDFLARE_TRAFFIC_ROUTING_PROFILE` — declared TrafficRouting offerings
  (`lb.lifecycle`, `lb.weighted`, `lb.health`, `observe.health`) for Matching
- `createCloudflareProvider()` implementing the `CloudProvider` contract:
  `id`, `regions`, `capabilities`, `realize(plan)`, `capabilityManifest()`,
  `client(port, outputs)`
- `realize(plan)` emits a Pulumi `IacProgram` (the exact shape
  `@hobo/iac-pulumi.validateIacProgram()` accepts) plus an optional `BuildSpec`
- Typed `cloudflare.with.worker/r2/kv` option builders
- Published Capability Manifest (`capabilities.json`, `auth.json`, `cost.json`)

## Scope (out)

- Live Terraform apply against permanent Cloudflare accounts — `realize`
  emits programs, it does not apply them (temporary Environment Stations are
  the exception below)
- The Planner (S2-02) and Yard (S2-01)
- D1, Queues, DNS, Hyperdrive

## Temporary Environment Stations (in scope)

Anonymous visitors need a real Cloudflare Environment Station without OAuth.
Cloudflare Temporary Accounts ([claim deployments](https://developers.cloudflare.com/workers/platform/claim-deployments/))
are the **only** auth model — **no** permanent `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID` for this path.

| Path | When | API |
|---|---|---|
| `provisionTemporaryEnvironmentStation()` | Agents / Node backends | REST `provisioning/previews` + PoW + Workers script upload |
| `deployTemporaryWithWrangler()` | Agents / CLI | `wrangler deploy --temporary` (Wrangler ≥ 4.102, **logged out**) |
| `bootstrapCorsRelayViaTemporaryAccounts()` | Fix browser CORS | Deploys CORS relay Worker via Temporary Accounts |
| CORS relay `POST /station` | Examples static site | Browser → relay `workers.dev` → Temporary Accounts (Worker→CF has no CORS) |

Browser cannot read `api.cloudflare.com` Temporary Accounts responses (no ACAO).

## `cloudflare.temporary-account-yard/v1` — the claimable edge Yard

`provisionTemporaryAccountYard()` is the capability-profile-aware path (the
older `provisionTemporaryEnvironmentStation()` above still deploys a Station and
is unchanged). It runs entirely server-side through an **injected**
`TemporaryAccountTransportPort` — there is no reference to the global `fetch` in
`src/temporary-account*.ts` — and it enforces, in this order:

1. **Consent first.** `parseConsentEvidence()` requires an opaque subject
   reference plus acceptance of Cloudflare's exact Terms and Privacy URLs, and
   the evidence is written to a `ConsentLedgerPort` **before** the first
   provisioning request. A missing acceptance fails closed with
   `CONSENT_REQUIRED` and no request is sent.
2. **Bounded proof of work.** The challenge is refused above `k * g = 64,000,000`
   (Cloudflare's own bound) or a lower caller budget (`WORK_BUDGET_EXCEEDED`).
3. **Custody.** `account.apiToken` goes straight into a `SecretCustodyPort` and
   is returned only as a `SecretRef`. No returned value, event, or receipt
   contains it; a custody failure is `SECRET_CUSTODY_UNAVAILABLE`.
4. **One-time claim action.** `claim.url` is a bearer credential, so it is stored
   in a `OneTimeActionVaultPort` and surfaced as an opaque
   `SensitiveActionRef` (`hobo-action:cloudflare.claim-deployment:…`).
   `redeemClaimAction()` discloses the URL once, to the audience it was minted
   for, before the recorded deadline.
5. **Lease from the response.** `GuestLease` records `account.expiresAt` and
   `claim.expiresAt` **as returned by Cloudflare**. The documented 60-minute
   window is carried alongside as documentation
   (`documentedClaimWindowMinutes` + source URL + checked date), never as the
   authority for an expiry decision.

After the claim, `completeTemporaryAccountClaim()` verifies ownership through an
independent `ClaimVerificationPort`, destroys the residual token and claim
action, and refuses to finish while the provider still reports the bootstrap
token as active (`BOOTSTRAP_AUTHORITY_REMAINS`). Continuing HoBo/agent
management is a **separate ceremony**: `creatorAuthorityAfterClaim` is
`"reauthorization-required"` and `assertManagementAuthorized()` throws
`REAUTHORIZATION_REQUIRED` without a fresh grant.

Ambiguous outcomes are never blind-retried. A lost mutating response raises
`PROVIDER_OPERATION_AMBIGUOUS`; the recorded attempt is resolved with
`observeAndAdoptTemporaryAccount()`, which adopts what actually exists or
reports `not-created`.

### Verified supported resources and limits

Source: [Claim deployments (temporary accounts)](https://developers.cloudflare.com/workers/platform/claim-deployments/)
— doc "Last updated Jul 14, 2026", re-read **2026-08-08**. `assertTemporaryAccountResourceAllowed()`
fails closed on everything outside this table.

| Resource | Documented capability or limit | Verified |
|---|---|---|
| Workers | Deployments on `workers.dev` (no custom domain until claimed) | yes |
| Workers Static Assets | Up to 1,000 files, each asset up to 5 MiB | yes |
| Workers KV | Namespace create/list/rename/delete; key put/get/list/delete; bulk put/get/delete | yes |
| D1 | One database, up to 100 MB per database and 100 MB total | yes |
| Durable Objects | Workers with Durable Object bindings and migrations | yes |
| Hyperdrive | Up to 2 database configurations and 10 connections | yes |
| Queues | Up to 10 queues | yes |
| mTLS and CA certificates | `wrangler cert` upload, list, delete | yes |

Numbers are stored in the doc's own units (`mebibytes`, `megabytes`, `count`,
`connections`) rather than re-derived into bytes, because "100 MB" is not a
byte count Cloudflare committed to.

Corroborated independently: wrangler registers `--temporary` only on the
commands the preview token can serve — Workers, KV, D1, Hyperdrive, Queues, and
certificate commands — with "Pages/R2/AI/etc. aren't" stated in the same change
([cloudflare/workers-sdk 1664d46](https://github.com/cloudflare/workers-sdk/commit/1664d4687e04e0cfb350fd931498eb59ac324f06),
read 2026-08-08).

**Explicitly refused** — absent from that table on the checked date, so refused
with `RESOURCE_NOT_SUPPORTED` until both current docs and a conformance run say
otherwise: **R2**, **Containers**, **Vectorize**, **Workers AI**, **Secrets
Store**, **Cron Triggers**, and custom domains. Cron Triggers matter for
capability honesty: no temporary-account product claims
`service.scheduled/v1`.

### What is *not* verified

| Verified 2026-08-08 | Not verified |
|---|---|
| The supported-resources table above, verbatim | The REST **paths** (`/client/v4/provisioning/previews`, `…/previews/challenge`) |
| The 60-minute claim window, and that opening the claim URL is not itself enough | The request/response **JSON field names** (`account.id`, `account.apiToken`, `claim.url`, …) |
| Proof-of-work required before account creation; rate-limited creation | The proof-of-work challenge **wire shape** |
| Terms of Service and Privacy Policy must be accepted in the product | |
| REST provisioning exists ([changelog, 2026-07-14](https://developers.cloudflare.com/changelog/post/2026-07-14-temporary-accounts-api/)) | |

The unverified half is contained rather than assumed: `parsePreviewAccountResponse()`
and `parsePreviewChallengeResponse()` accept only the exact shapes above, with
bounded lengths, and refuse anything else with `PROVIDER_CONTRACT_CHANGED`. A
wrong guess is therefore a typed refusal at the boundary, not a half-parsed
account — and correcting it is a change to two parsers and their fixtures.

### Product definitions

`CLOUDFLARE_TEMPORARY_ACCOUNT_DEFINITIONS` are pure `SelectionCandidate` data
consumed by `@hobo/capability-profiles`:

| Definition | Capability profiles |
|---|---|
| `cloudflare.temporary-workers-web/v1` | `web.static/v1`, `web.hosted/v1` |
| `cloudflare.temporary-workers-api/v1` | `api.http/v1` |
| `cloudflare.temporary-queue-consumer/v1` | `service.queue-consumer/v1` |
| `cloudflare.temporary-d1/v1` | `data.sqlite/v1`, `data.relational/v1` — **never** `data.postgres/v1` |
| `cloudflare.temporary-kv/v1` | `kv.key-value/v1` |
| `cloudflare.temporary-durable-object/v1` | `kv.durable-object/v1`, `realtime.websocket/v1` |
| `cloudflare.temporary-queue/v1` | `queue.at-least-once/v1` |
| `cloudflare.temporary-hyperdrive/v1` | none — connectivity only, produces `binding.postgresql/v1` |
| `cloudflare.temporary-webhook-realtime/v1` | `webhook.inbound-http/v1`, `realtime.websocket/v1` |

D1 speaks SQLite, so a `data.postgres/v1` requirement must lose it to a real
PostgreSQL product; `test/temporary-account-definitions.test.ts` pins that
through `selectCapabilityImplementation`. Hyperdrive is connectivity to somebody
else's database and therefore satisfies no `data.*` requirement at all.

### Stable error codes

`PROVIDER_RATE_LIMITED`, `PROVIDER_AUTH_FAILED`, `PROVIDER_CONTRACT_CHANGED`,
`PROVIDER_OPERATION_AMBIGUOUS`, `PROVIDER_RESPONSE_TOO_LARGE`,
`PROVIDER_UNAVAILABLE`, `TRANSPORT_NOT_ALLOWED`, `CONSENT_REQUIRED`,
`LEASE_EXPIRED`, `CLAIM_EXPIRED`, `CLAIM_NOT_VERIFIED`, `CLAIM_ACTION_CONSUMED`,
`REAUTHORIZATION_REQUIRED`, `BOOTSTRAP_AUTHORITY_REMAINS`,
`SECRET_CUSTODY_UNAVAILABLE`, `RESOURCE_NOT_SUPPORTED`, `WORK_BUDGET_EXCEEDED`.

Transport requests are HTTPS-only and restricted to `api.cloudflare.com`, with a
bounded timeout (15 s default, 60 s ceiling) and a 256 KiB response ceiling.
Tests run fully offline against sanitized fixtures whose credentials are
prefixed `FAKE-`.

## Convex self-host on Cloudflare Containers (anon, opt-in)

`provisionConvexBackendOnCloudflare()` can anon-deploy the official
`ghcr.io/get-convex/convex-backend` image as a Workers Container behind a
proxy Worker. **No local Docker. No permanent `CLOUDFLARE_API_TOKEN`.**

Uses Temporary Accounts (PoW) → `wrangler deploy` with temp creds (not
`--temporary`, which races Containers apply). Image is a registry URI —
Cloudflare pulls it.

**Examples anon Temporary Convex self-host is fail-closed** under zero project
API keys (`@hobo/provider-convex` `provisionConvexBackendAnonymous` rejection
matrix). Cloudflare Temporary Containers apply returns **403**; opt in with
`HOBO_CONVEX_OCI_HOST=cloudflare`. Mock via `HOBO_CONVEX_SWAGHAUS_MOCK=1`.

**Local website (preferred):** `pnpm --filter hobo-site run dev` serves
same-origin `POST /HoBo/api/cf-temp/station` via Vite middleware → Temporary
Accounts REST. Examples Deploy stations works with **only the website** — no
external CORS relay URL, no permanent tokens.

**Static hosts (GitHub Pages):** set `PUBLIC_HOBO_STATION_BROKER_URL` to a live
Temporary Accounts CORS relay from:

```bash
pnpm exec tsx scripts/bootstrap-cf-cors-relay.mts
# → relayUrl + claimUrl  (open claimUrl to keep past ~60m)
```

Agents can also call `provisionTemporaryEnvironmentStation()` directly
(Node Temporary Accounts — proven live). Fail closed if broker unreachable —
never `blob:` as Cloudflare.

Note: Temporary Worker–hosted CORS relays may hit Cloudflare edge **1042** when
managing sibling Workers Scripts; prefer same-origin `/api/cf-temp` locally, or
claim the relay account / provision from Node Temporary Accounts.
Aligns with HoBo claim semantics (`deployment.Claimed` / anonymous → account).

## Boundary note: iac-pulumi is test-only

The workspace boundary guard forbids adapter → adapter runtime imports
(providers may import only core ports). `realize()` therefore emits a plain
typed `IacProgram` object (see `src/iac-program.ts`) mirroring the
`@hobo/iac-pulumi` published wire shape, with **no** runtime or `package.json`
dependency on that adapter. `@hobo/iac-pulumi` is imported **only** from
`test/conformance-iac-pulumi.test.ts` to prove — at test time — that the real
`validateIacProgram()` / backend conformance suite accepts the emitted programs.

## Architecture evidence

- `data-models/` — protobuf records + CUE constraints for the capability
  manifest and provider ports
- `contracts/provider-cloudflare-boundary.pact.json` — ProviderCloudflareBoundary
  pact (manifest publish + hello-bindle realize)
- `contracts/provider-cloudflare-realize-emission.pact.json` —
  RealizeEmissionBoundary pact (ResourcePlan → IacProgram)
- `ADR.md` — parse-don't-validate + realize-emission / event-architecture
  evidence

## Validation

```bash
pnpm --filter @hobo/provider-cloudflare run build
pnpm --filter @hobo/provider-cloudflare run test
```
