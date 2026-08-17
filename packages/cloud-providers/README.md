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

## Builder authoring: `station` / `yard` / `camp`

`station`, `yard` and `camp` are re-exported here from `@hobo/yards`
(`buildStation` / `buildYard` / `buildCamp`) so one import line gets both the
noun and the offerings that fill it. They give Station, Yard and Camp the same
shape `bindle()` already has: a name plus a builder callback.

```ts
import { station, yard, camp, azure, cloudflare } from "@hobo/cloud-providers";

export default station("acme", (s) => {
	s.tenant("acme").residency("eu").trustDomain("acme.hobo.internal");

	s.yard("prod-eu", (y) => {
		y.on(azure).region("westeurope").residency("eu").label("tier", "public");

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
- **`y.on(provider)` states a provider, never infers one.** It accepts a
  namespace object (reading its `PROVIDER_ID`), a provider id string, or
  `{ id }`.
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
