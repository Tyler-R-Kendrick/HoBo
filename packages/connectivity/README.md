# `@hobo/connectivity`

Multi-tenant connectivity foundations for HoBo: **DNS-valid hierarchical naming**, optional **local named HTTPS** (portless), **cross-cloud overlay** (Tailscale primary / Netbird alternative), **pluggable public DNS**, **PolicyEngine**, and **metering/usage events**.

## Quick starts

### 1. Hierarchical naming (pure)

```ts
import { getNamedEndpoint } from "@hobo/connectivity";

getNamedEndpoint({ resource: "web", app: "myapp", env: "local", mode: "local" });
// → https://web.myapp.local.hobo.localhost

getNamedEndpoint({ resource: "web", app: "myapp", env: "prod", mode: "overlay" });
// → https://web.myapp.hobo.test  (prod segment omitted)

getNamedEndpoint({
  resource: "web", app: "myapp", env: "dev", tenant: "acme", mode: "overlay",
});
// → https://web.myapp.dev.acme.hobo.test
```

Schema: `{resource}.{app}.{env?}.{branch?}.{project?}.{tenant?}.hobo.{tld}`  
`hobo` is a **zone label**, never a TLD. Bare `.hobo` is never emitted.

### 2. Local named mode (`hobo dev`)

```bash
# Port-based default (unchanged when portless is absent):
pnpm --filter @hobo/hobo exec hobo dev --once --json

# Optional named HTTPS front-end:
#   1. Install vercel-labs/portless
#   2. portless trust   # one-time local CA
#   3. HOBO_PORTLESS=1 hobo dev
# Force off: HOBO_PORTLESS=0
```

`DevServeResult` / serve results include `namedEndpoints` and `primaryNamedUrl`.  
MCP discovers them via `hobo inspect` (`data.namedEndpoints` / `primaryNamedUrl`).

### 3. Overlay mode (junction / laptop)

```ts
import {
  createTailscaleOverlay,
  createJunctionAgent,
  createTagAclPolicyEngine,
  createMeteringBus,
  createInMemoryMeteringSink,
} from "@hobo/connectivity";

const sink = createInMemoryMeteringSink();
const metering = createMeteringBus([sink]);
const policy = createTagAclPolicyEngine({ metering });
const overlay = createTailscaleOverlay({ metering, policy });

const agent = createJunctionAgent({
  config: { tenantId: "acme", name: "junction-aws-1", role: "junction", env: "dev", cloud: "aws" },
  overlay,
  policy,
  metering,
});
await agent.start();
```

Example Tailscale ACL tags:

```jsonc
// tagOwners / ACLs (sketch)
{
  "tagOwners": {
    "tag:broker": ["autogroup:admin"],
    "tag:junction": ["autogroup:admin"],
    "tag:dev-laptop": ["autogroup:admin"]
  },
  "acls": [
    { "action": "accept", "src": ["tag:dev-laptop"], "dst": ["tag:broker:*", "tag:junction:*"] },
    { "action": "accept", "src": ["tag:junction"], "dst": ["tag:broker:*"] }
  ]
}
// HoBo also stamps tenant:<slug>, role:<role>, env:<env>, cloud:<cloud>
```

### 4. Public DNS modes

```yaml
# Platform owns DNS (HoBo only suggests entrypoints):
dns:
  public:
    managedBy: cloud-provider   # or "none"
    provider: route53

# HoBo manages entrypoint records via a swappable provider:
dns:
  public:
    managedBy: hobo
    provider: dnscontrol        # or memory | cloudflare | …
    zone: example.com
    allowedGatewaySuffixes: [".ts.net", ".cfargotunnel.com"]
```

```ts
import {
  createPublicDnsManager,
  createDnsControlProvider,
  createMemoryDnsProvider,
} from "@hobo/connectivity";

// cloud-provider / none → applied:false, returns suggested CNAME to gateway only
// hobo + provider → upserts CNAME; refuses raw overlay IPs
```

DNSControl is preferred for TypeScript ecosystems; octoDNS is a valid alternative. Dotnify is experimental and not primary.

### 5. Multi-tenant sketch

```ts
import { parseTenantId, getNamedEndpoint } from "@hobo/connectivity";

const tenant = parseTenantId("acme");
// Control-plane resources carry tenantId; policy denies cross-tenant by default.
getNamedEndpoint({
  resource: "api", app: "payments", env: "staging", tenant, mode: "overlay",
});
// → https://api.payments.staging.acme.hobo.test
```

Set `HOBO_TENANT`, optional `HOBO_PROJECT` / `HOBO_BRANCH` / `HOBO_ENV` for local promotion context.

## How to test

```bash
pnpm --filter @hobo/core test
pnpm --filter @hobo/connectivity test
pnpm --filter @hobo/hobo test   # local yard parity still offline
```

| Scenario | Expectation |
|----------|-------------|
| Local without portless | Port URLs unchanged; hierarchical names still emitted; one-line portless hint |
| Local with portless | `primaryNamedUrl` https://…hobo.localhost preferred in discovery |
| Junction start without tailscale | Degraded join, metering `junction.join`, notes explain install |
| DNS `managedBy: none` | Suggest only, no zone write |
| DNS `managedBy: hobo` + gateway | CNAME upsert + usage event |
| Cross-tenant policy | Deny + `policy.evaluate` usage event |

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for Mermaid diagrams covering local named mode, overlay mode, pluggable DNS, and multi-tenant / policy / metering foundations.

## Next-step surfaces (landed)

| Surface | How |
|---------|-----|
| MagicDNS split | `overlay.configureMagicDns({ domains: ["hobo.test"], nameservers: [...] })` |
| Funnel gateway | `overlay.publishFunnel({ backendUrl, tenantId })` → `*.ts.net` only |
| Cloudflare DNS | `createCloudflareDnsProvider({ apiToken, zoneId, fetchImpl? })` |
| Route53 DNS | `createRoute53DnsProvider({ accessKeyId, secretAccessKey, signRequest?, allowUnsigned? })` |
| OPA/Rego policy | `createOpaPolicyEngine({ opaUrl?, regoModulePath? })` + `SAMPLE_HOBO_AUTHZ_REGO` |
| Billing aggregator | `createBillingAggregator()` as a `MeteringSink` → `closePeriod()` invoices |
| Hard multi-tenant | `createTenantIsolationRegistry()` with `soft` \| `hard-overlay` \| `hard-control-plane` |
| Dynamic DNS heartbeats | `createJunctionDynamicDnsRegistrar` / `createJunctionAgent({ publicDns, dnsTargets })` |

```ts
import {
  createBillingAggregator,
  createCloudflareDnsProvider,
  createJunctionAgent,
  createOpaPolicyEngine,
  createPublicDnsManager,
  createTailscaleOverlay,
  createTenantIsolationRegistry,
  tenantFromSlug,
} from "@hobo/connectivity";

// Hard isolation
const isolation = createTenantIsolationRegistry();
isolation.registerTenant(tenantFromSlug("acme", "hard-control-plane"));

// OPA policy + billing sink
const billing = createBillingAggregator();
const policy = createOpaPolicyEngine({ opaUrl: process.env.HOBO_OPA_URL });
const overlay = createTailscaleOverlay({ policy });
const dns = createPublicDnsManager({
  config: { managedBy: "hobo", provider: "cloudflare", zone: "example.com" },
  provider: createCloudflareDnsProvider({
    apiToken: process.env.CF_API_TOKEN!,
    zoneId: process.env.CF_ZONE_ID,
  }),
});
const agent = createJunctionAgent({
  config: {
    tenantId: "acme",
    name: "junction-aws-1",
    overlayNetworkId: "overlay-acme",
    dnsTargets: [{ resource: "web", app: "myapp", backendUrl: "http://127.0.0.1:7071" }],
  },
  overlay,
  policy,
  publicDns: dns,
});
await agent.start();
await agent.heartbeat(); // Funnel + CNAME reconcile
const invoice = billing.closePeriod({
  tenantId: "acme" as never,
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
});
```

## Residual limitations

- Route53 live AWS calls need a SigV4 `signRequest` (unsigned only for tests).
- Netbird management API is planned/stubbed; port methods exist.
- OPA HTTP / `opa eval` used when available; otherwise in-process Rego-like fallback.
- Billing produces invoices in-process — no Stripe/payment capture.
- Hard isolation allocates planes in-process; multi-process control-plane sharding is follow-on ops.
