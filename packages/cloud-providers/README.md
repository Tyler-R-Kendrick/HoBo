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

| Namespace | Products with a resolver | What a deploy does today |
|---|---|---|
| `cloudflare` | all — Cloudflare API v4 drivers | Drivers are proven against an **injected fake transport**. No live deploy is proven in this repo: that additionally needs real credentials and network egress. |
| `vercel` | all — Vercel API drivers | Same: fake-transport proof only. |
| `gcp` | **9 of 14** — Google REST drivers | Same: fake-transport proof only. The other 5 fail closed. See `GCP_RESOLVED_PRODUCT_IDS` / `GCP_UNRESOLVED_PRODUCT_IDS`. |
| `azure` | **9 of 16** — ARM drivers | Same: fake-transport proof only. The other 7 fail closed. See `AZURE_RESOLVED_PRODUCT_IDS` / `AZURE_UNRESOLVED_PRODUCT_IDS`. |
| `aws` | **7 of 19** — SigV4-signed drivers | Same: fake-transport proof only. The other 12 fail closed. See `AWS_RESOLVED_PRODUCT_IDS` / `AWS_UNRESOLVED_PRODUCT_IDS`. |
| `digitalocean` | **12 of 15** — v2 bearer-token drivers + Spaces over SigV4 | Same: fake-transport proof only. The 3 without drivers are non-convergent by DigitalOcean's API shape, not by omission. `queue`, `topic` and `secretRef` carry no rows at all, because DigitalOcean sells none of them. |
| `kubernetes` | **8 of 9** — apiserver drivers | Same: fake-transport proof only. The 9th is the Secret, which ships no driver by design. This namespace also has a placement driver that does reach a real apiserver. Catalog is built-ins only: databases, caches and queues arrive through operators. |
| `hetzner` | **4 of 5** — Cloud API drivers + Object Storage over SigV4 | Same: fake-transport proof only. The 5th is the Storage Box, which is not on the Cloud API at all (404 there, vs 401 for `/v1/volumes`) — it is Robot-administered behind a console password. Five slots carry no rows: Hetzner sells no managed database, cache, queue, topic or secret store. |
| `hostinger` | **2 of 5** — adopt-and-converge drivers | The odd one out. On Hostinger allocation is a **billing order**, so these resolvers converge an instance you already bought and refuse to purchase one — a refusal the transport guard enforces by not allowlisting `/api/billing/v1/`. Fake-transport proof only. |

Two limits apply to every row above, including the ones marked "all":

1. **No provider's product ids are registered in the definition catalog.** So even a product with a working resolver refuses at resolution
   today. That is a deliberate fail-closed gap, not a silent one: a deploy
   refuses rather than half-applying.
2. **"Has a resolver" is not "deploys."** Every resolver in this repo is proven
   against an injected fake transport modelling the provider's API. No live
   call has been made against any provider. Pinned API versions and request
   body field names are documentation-derived and have not been verified
   against a running service.

An unresolved product is not always a coverage gap. Some are design limits the
provider's own API imposes — neither `azure.postgres-flexible/v1` nor
`aws.rds-postgres/v1` can ship a resolver, because each one's create call
requires an administrator password in the request body, and a `desired` record
may not carry credential-shaped keys. Others are identity limits:
`aws.api-gateway/v1` mints a fresh random id per call with no name uniqueness,
so a retry after a lost response would create a second API rather than
converge. And some are refusals this repo chose on purpose:
`kubernetes.secret/v1` ships no resolver because creating a Secret means
putting its contents in a `desired` record that is written to the event log,
and `hostinger.vps/v1` will not place the billing order that would allocate
one. The
`*_UNRESOLVED_PRODUCT_IDS` declarations carry the reason per id, and distinguish
the two cases.

No catalog enumerates all of its provider. Each declares the offerings that have
typed factories; a missing alternative is a gap in the factory set, not a
selection the Yard made.

## Builder authoring: `station` / `yard` / `camp`

`station`, `yard` and `camp` are re-exported here from `@hobo/yards`
(`buildStation` / `buildYard` / `buildCamp`) so one import line gets both the
noun and the offerings that fill it. They give Station, Yard and Camp the same
shape `bindle()` already has: a name plus a builder callback.

```ts
import { station, yard, camp, azure, cloudflare } from "@hobo/cloud-providers";

export default station("acme", (s) => {
	s.tenant("acme").residency("eu").trustDomain("acme.hobo.internal");

	s.yard(azure, "prod-eu", (y) => {
		y.region("westeurope").residency("eu").label("tier", "public");

		// Slot methods are variadic — several offerings per capability is normal.
		y.web(azure.containerApps({ ingress: "external" }), azure.appService({ sku: "P1v3" }));
		y.data(azure.postgresFlexible({ tier: "GeneralPurpose" }));
		y.bucket(azure.blobStorage({ accessTier: "hot" }));

		// Camps nest inside the Yard, so the Yard's id and provider are already
		// known and never re-supplied by hand.
		y.camp("api", (c) => c.production().label("exposure", "public"));
		y.camp("preview", (c) => c.preview().require("ephemeral").label("ttl", "72h"));
	});

	s.yard(cloudflare.Yard()); // a prebuilt catalog Yard — same method, overloaded
});
```

The rules, and why each one is there:

- **One verb per noun** — `station`, `yard`, `camp`, and `bindle` in
  `@hobo/bindles`. No `define*`, no `attach*`.
- **Nesting replaces attachment.** `y.camp(…)` does what `attachCampToYard` did,
  deriving `yardId` and `providerId` from the enclosing Yard. Handing a Yard
  back its own two identifiers was never information the author had.
- **Callback for containers, chaining for scalars** — the split `bindle()`
  already uses.
- **Slot methods are variadic and accumulate.** One method per `CapabilitySlot`
  (`web api service data kv bucket queue topic secretRef webhook`), installed
  from `CAPABILITY_SLOTS` in `@hobo/core` so the surface cannot drift from the
  vocabulary. `y.web(a)` then `y.web(b)` declares two offerings; silently
  dropping the first would be a portability lie.
- **The provider is an argument, not a builder call.** `yard(azure, "prod-eu", …)`
  establishes it before the callback runs, so there is no window in which slot
  calls are written against a Yard with no provider yet, and moving a line
  cannot change whether the code makes sense. It accepts a namespace object
  (reading its `PROVIDER_ID`), a provider id string, or `{ id }` — and it is
  still stated, never inferred, because inferring one from a Yard name or a
  product-id prefix is the load-bearing naming convention ADR-0144 forbids.
  ES module namespace objects are accepted directly; no plain-object copy is
  needed.
- **No bare strings where a vocabulary exists.** Capability profiles come from
  `capability` in `@hobo/core` (`capability.data.postgres`, not
  `"data.postgres/v1"`) and Camp environments from `ENV_TYPES`. A typo is a
  compile error instead of a row that matches nothing, and `slot: "kv"` will not
  accept a `data.*` profile — the `SLOT_PROFILE_MISMATCH` refusal still exists
  for untyped callers, but typed ones can no longer reach it.
- **Order is not information.** Slots compile in `CAPABILITY_SLOTS` order,
  Camps sort by id, Yards sort by name, and every string list is canonicalized.
  Two builders declaring the same things in different orders are deep-equal.

### It is a front end, not a fork

Every builder terminates in the code that already ships — `defineYard`,
`defineStation`, `camp()` and, through `yard()`, `attachCampToYard`. So
`SLOT_KEY_MISMATCH`, `SLOT_PROFILE_MISMATCH`, `SLOT_BINDING_CREDENTIAL_PROPERTY`,
`YARD_BINDING_DUPLICATE`, `YARD_BINDING_EMPTY_CONSTRAINT`, `STATION_NO_YARDS`,
`STATION_DUPLICATE_YARD`, `camp-provider-selection-forbidden` and
`camp-bindle-ownership-forbidden` all still fire with their existing codes and
messages. `test/builders.test.ts` pins the example above to the `defineStation`
authoring of the same topology, and `packages/yards/test/builder.test.ts` drives
each refusal through the builder path.

### Additive, not a migration

`defineYard`, `defineStation`, `yard()` and `camp()` keep working exactly as
they do now. Nothing needs rewriting.

### Bindle stays in `@hobo/bindles`

`bindle()` is not re-exported here and is not wrapped. App authoring and ops
configuration are different lifecycles with different owners and different
review paths; folding them into one import would make a single surface out of
two unrelated jobs, which is a worse surface, not a better one.

### Known limits

- `station(…)` returns the `StationManifest` that `defineStation` returns — the
  registration record a composition root hands to `station()` in
  `@hobo/stations`. A Station registers Yards; it never parents them
  ([ADR-0131](../../docs/design/adr/07-portability-extensibility.md)).
- The Yard builder has exactly `defineYard`'s expressive range. `require`,
  `prefer`, `isolation`, `network`, `properties`, `runtimeId` and
  `resolverDefaults` are Yard fields `defineYard` does not accept either;
  authoring those still goes through `yard()` directly. Widening the builder
  past its compile target would mean bypassing it.
- `c.provider(…)` and `c.bindle(…)` exist on the Camp builder only to be
  refused, so the two old mistakes get their existing remediation instead of an
  "unknown method".
