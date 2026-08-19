# @hobo/provider-hetzner

The Hetzner `CloudProvider`: the Hetzner row of the cross-cloud equivalence
table, a full allocatable Yard catalog, and bearer-token `ResourceResolver`s
for the convergent part of it.

```sh
pnpm --filter @hobo/provider-hetzner test
```

## What this package ships

- **Equivalence → default Resource Definitions** (`EQUIVALENCE_CLASSES` /
  `createHetznerProvider`), with Matching's `satisfies` answering
  full/partial/none rather than fabricating parity.
- **`realize()` → `hobo.iac-program/v1`** for the primary Pulumi lane, with
  bind edges resolving as `${resources.<dep>.outputs.binding}` across a whole
  deployment plan.
- **A typed authoring surface**: `hetzner.with.cloudServer(…)` and friends emit
  provider-specific option blocks that are inert for other providers, and the
  slot factories (`cloudServer()`, `loadBalancer()`, `objectStorage()`,
  `volume()`, …) each own one `(slot, profile, productId)` triple.
- **A default Yard catalog** (`hetznerYardSpec()`): what Hetzner *can* allocate,
  per slot, as canonical rows `@hobo/yards` parses.
- **Direct Cloud API resolvers** (`hetznerResolvers()`): read-or-create
  reconciliation against `api.hetzner.cloud/v1` over an injected, guarded
  transport.
- **The published Capability Manifest**, with declared cost facts and a
  credential-locator auth posture that stores no material.

## Honest scope

- **Hetzner is a narrow provider and this package says so.** There is no
  managed database, cache, queue, topic or secret store here, because Hetzner
  does not sell one. Five Yard slots are empty and the equivalence table has
  two rows, not six. An app that needs Postgres gets a truthful `none` from
  this provider rather than a virtual machine it would have to administer.
- **No live deploy is proven here.** The resolvers are exercised against an
  *injected fake* transport modelling a Hetzner project. A real deploy
  additionally needs a real token, real network egress, and a real project.
- **3 of the 5 catalogued products have resolvers**
  (`HETZNER_RESOLVED_PRODUCT_IDS`): Cloud Servers, Load Balancers and Volumes.
  The other two are on hosts this package deliberately does not allowlist — see
  below.
- **No Resource Definitions are registered** for the `hetzner.*` product ids,
  so a deploy against this Yard still fails closed at resolution
  (`YARD_BINDING_PRODUCT_UNKNOWN`).
- **Endpoint paths and field names are transcribed** from Hetzner's published
  API reference, not replayed against the running service.
- **Cost facts are `declared-provider`**, transcribed from the public pricing
  page rather than attested by a signed billing feed. Hetzner's monthly price
  cap is a real saving these facts do not model.

## Three surfaces, one allowlisted

Hetzner splits its products across three hosts with three different
credentials, and the transport guard allowlists exactly one:

| Surface | Host | Credential | Allowlisted |
|---|---|---|---|
| Cloud API | `api.hetzner.cloud/v1` | project API token | **yes** |
| Object Storage | `<location>.your-objectstorage.com` | separate S3 key pair, SigV4 | no |
| Robot | `robot-ws.your-server.de` | HTTP Basic, web console password | no |

That is why `hetzner.object-storage/v1` and `hetzner.storage-box/v1` ship no
resolver. The Robot case is the sharper one: a resolver reaching that surface
would be sending a *console password* through an injected transport, which is a
different and much worse thing to hand out than a scoped project token. Both
exclusions are exported as `HETZNER_EXCLUDED_SURFACES`, so widening the guard is
an edit a reviewer sees.

## Convergence, and what it costs

Hetzner's collections accept an exact `?name=` filter, so "does my resource
already exist" is one bounded call rather than a paged scan — a nicer property
than most provider APIs offer, and the reason this package needs no page
budget. Three consequences worth stating plainly:

1. **Two records under one name is a refusal, not a coin flip.** Hetzner
   enforces name uniqueness per project, so a second match means the filter did
   not behave as this code believes — a reason to stop, not to pick one.
2. **Provisioning is asynchronous and nothing here polls.** Hetzner answers a
   mutation with an `Action` that is still running; the action id goes into
   `outputs` so a caller who wants to wait has something to wait on, and the
   diagnostic says plainly that this resolver did not.
3. **`"replace"` is never emitted.** Rescaling a server needs a power-off and
   shrinking a volume is impossible, so drift on those is reported as a
   diagnostic and left for a human rather than "fixed" by destroying a machine.

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
`normalizeHetznerYardSignal` folds native server and network signals into
`yard.*` events. Read stores rebuild from the log, so no snapshot here is
load-bearing. See [`ADR.md`](./ADR.md) for the full command/event walk.

## API surface reached

| Product | Endpoint |
|---|---|
| `hetzner.cloud-server/v1` | `GET/POST/DELETE /v1/servers` |
| `hetzner.load-balancer/v1` | `GET/POST/DELETE /v1/load_balancers`, `POST …/actions/change_algorithm` |
| `hetzner.volume/v1` | `GET/POST/DELETE /v1/volumes`, `POST …/actions/resize` |
