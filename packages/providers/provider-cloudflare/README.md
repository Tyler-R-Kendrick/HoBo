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

- Live Terraform/Wrangler execution against real Cloudflare accounts — `realize`
  emits programs, it does not apply them
- The Planner (S2-02) and Yard (S2-01)
- D1, Queues, DNS, Hyperdrive

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
