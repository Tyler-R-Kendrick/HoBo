# @hobo/provider-digitalocean

The DigitalOcean `CloudProvider`: the DigitalOcean row of the cross-cloud
equivalence table, a full allocatable Yard catalog, and bearer-token
`ResourceResolver`s for the convergent half of it.

```sh
pnpm --filter @hobo/provider-digitalocean test
```

## What this package ships

- **Equivalence → default Resource Definitions** (`EQUIVALENCE_CLASSES` /
  `createDigitalOceanProvider`), with Matching's `satisfies` answering
  full/partial/none rather than fabricating parity.
- **`realize()` → `hobo.iac-program/v1`** for the primary Pulumi lane, with
  bind edges resolving as `${resources.<dep>.outputs.binding}` across a whole
  deployment plan.
- **A typed authoring surface**: `digitalocean.with.appPlatform(…)` and friends
  emit provider-specific option blocks that are inert for other providers, and
  the slot factories (`appPlatform.service()`, `managed.postgres()`, `spaces()`,
  …) each own one `(slot, profile, productId)` triple so a profile string is
  never typed by hand.
- **A default Yard catalog** (`digitaloceanYardSpec()`): what DigitalOcean *can*
  allocate, per slot, as canonical rows `@hobo/yards` parses.
- **Direct API resolvers** (`digitaloceanResolvers()`): read-or-create
  reconciliation against `api.digitalocean.com/v2` over an injected, guarded
  transport.
- **The published Capability Manifest**, with declared cost facts and a
  credential-locator auth posture that stores no material.

## Honest scope

- **No live deploy is proven here.** The resolvers are exercised against an
  *injected fake* transport modelling a DigitalOcean team. A real deploy
  additionally needs a real token, real network egress, and a real account,
  none of which a unit test supplies.
- **9 of the 14 catalogued products have resolvers**
  (`DIGITALOCEAN_RESOLVED_PRODUCT_IDS`). The other five are named in
  `DIGITALOCEAN_UNRESOLVED_PRODUCT_IDS` with the reason each one has no
  convergent path — Spaces is an S3 surface on a different host with a
  different credential; App Platform workers and jobs are components inside an
  app spec rather than standalone resources; Functions needs a per-call source
  upload; and a DOKS node pool is not the workload that runs on it.
- **No Resource Definitions are registered** for the `digitalocean.*` product
  ids, so a deploy against this Yard still fails closed at resolution
  (`YARD_BINDING_PRODUCT_UNKNOWN`).
- **Endpoint paths and field names are transcribed** from DigitalOcean's
  published API reference, not replayed against the running service. A field
  DigitalOcean has since renamed would fail at deploy time, not here.
- **Cost facts are `declared-provider`**, transcribed from the public pricing
  page rather than attested by a signed billing feed.
- **Two slots are deliberately empty.** DigitalOcean sells no first-party queue
  and no first-party secret store, so `queue`, `topic` and `secretRef` carry no
  rows. An empty slot is a gap an author can see; a row pointing at a product
  that does not exist is a portability lie.

## Convergence, and what it costs

DigitalOcean's v2 collections are keyed by a server-assigned id, not by the
name the caller chose, so "does my resource already exist" is a *listing*
question. Every `reconcile()` pages the collection — under a bounded page
budget — before it creates anything. That has three consequences worth stating
plainly:

1. **Two records with the same name is a refusal, not a coin flip.**
   DigitalOcean does not enforce name uniqueness on Droplets or Load Balancers,
   and picking "the first one" would make the managed resource depend on the
   order the API answered in.
2. **An exhausted page budget is a refusal too.** Concluding "absent" from a
   budget that ran out would create a duplicate of a resource on the page
   nobody read. Raise `maxListPages` if the team really is that large.
3. **Provisioning is asynchronous and nothing here polls.** A create comes back
   `status: "creating"` and that lands in `diagnostics` as *accepted, not
   confirmed*. A resolver that blocked a deploy on a provider's provisioning
   clock would be worse than one that reports the truth.

`"replace"` is never emitted. Replacing a database or a Droplet destroys data,
so drift on an immutable field (region, engine, image) is reported as a
diagnostic and left for a human.

## Parse, don't validate

Every untrusted value crosses a parse boundary that returns a derived parsed
type or a typed refusal: `parsePublishedManifest` for the published well-known
documents, `parseJsonRecord` for an API response body, `resolveToken` for a
`credentialRef`, and `slotBinding()` in `@hobo/core` for every catalog row.
Downstream code never re-checks a DTO.

## Event architecture

The provider holds no state. Its manifest snapshot enters the event store as a
registry fact; Matching folds the registry materialized view and records
`match.Decided`; the single-writer ResourceActor dispatches realization; and
`normalizeDigitalOceanYardSignal` folds native App Platform and VPC signals into
`yard.*` events. Read stores rebuild from the log, so no snapshot here is
load-bearing. See [`ADR.md`](./ADR.md) for the full command/event walk.

## API surface reached

| Product | Endpoint |
|---|---|
| `digitalocean.app-platform-service/v1`, `…-static-site/v1` | `GET/POST/PUT/DELETE /v2/apps` |
| `digitalocean.managed-{postgres,mysql,mongodb,opensearch,valkey}/v1` | `GET/POST/DELETE /v2/databases`, `PUT /v2/databases/{id}/resize` |
| `digitalocean.droplet/v1` | `GET/POST/DELETE /v2/droplets` |
| `digitalocean.load-balancer/v1` | `GET/POST/PUT/DELETE /v2/load_balancers` |

Everything else in the catalog is listed in
`DIGITALOCEAN_UNRESOLVED_PRODUCT_IDS`.
