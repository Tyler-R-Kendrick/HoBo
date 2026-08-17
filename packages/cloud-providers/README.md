# @hobo/cloud-providers

One import for every cloud's default Yard.

```ts
import { aws, azure, cloudflare } from "@hobo/cloud-providers";
import { defineStation } from "@hobo/yards";

export default defineStation("acme", {
  yards: [aws.Yard(), azure.Yard(), cloudflare.Yard({ regions: ["weur"] })],
});
```

Each namespace exposes `Yard()` plus that provider's slot factories, so
narrowing a catalog uses the same typed vocabulary the default is built from:

```ts
import { azure } from "@hobo/cloud-providers";
import { defineYard } from "@hobo/yards";

export const prod = defineYard("prod-eu", {
  provider: "azure",
  region: "westeurope",
  web: [azure.containerApps({ ingress: "external" }), azure.aks({ replicas: 3 })],
  data: azure.postgresFlexible({ tier: "GeneralPurpose" }),
});
```

## Why this package exists

A provider package is a layer-2 adapter: it may import `@hobo/core` and nothing
else HoBo. `yard()` lives in `@hobo/yards` at layer 3. So a provider can only
publish its catalog as *data* — `awsYardSpec()` and friends return plain rows,
not a `Yard`. Something above both has to do the parse, and doing it ad hoc at
every call site is how several slightly different spellings of "the default AWS
Yard" get into a codebase. This package is that something, and it decides
nothing: `composeYard` passes the catalog to `yard()` untouched, so canonical
ordering, duplicate rejection, and credential screening remain `@hobo/yards`
refusals with `@hobo/yards` error codes.

## A Yard is a catalog, not an inventory

Rows say what a provider *is able to* allocate ([ADR-0157](../../docs/design/adr/07-portability-extensibility.md#adr-0157)
decision 1). Several entries per capability is the normal case — Azure's `web`
lists Static Web Apps, App Service, Container Apps and AKS — and declaring one
allocates nothing. Selection among them happens at resolution time under
[ADR-0151](../../docs/design/adr/07-portability-extensibility.md#adr-0151)'s
hard gates and lexicographic ranking, never here.

## HONEST SCOPE

| Namespace | Resolvers | What a deploy does today |
|---|---|---|
| `cloudflare` | yes — Cloudflare API v4 drivers | Drivers are proven against an **injected fake transport**. No live deploy is proven in this repo: that additionally needs real credentials and network egress. |
| `vercel` | yes — Vercel API drivers | Same: fake-transport proof only. |
| `aws` | **no** | Catalog only. Fails closed at resolution (`YARD_BINDING_PRODUCT_UNKNOWN`, or no registered resolver). |
| `azure` | **no** | Catalog only, same failure mode. |
| `gcp` | **no** | Catalog only, same failure mode. |

None of the `aws.*` / `azure.*` / `gcp.*` product ids these factories emit is
registered in the definition catalog. That is a deliberate fail-closed gap, not
a silent one: a deploy refuses rather than half-applying.

No catalog enumerates all of its provider. Each declares the offerings that have
typed factories; a missing alternative is a gap in the factory set, not a
selection the Yard made.
