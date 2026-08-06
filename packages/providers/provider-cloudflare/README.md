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
