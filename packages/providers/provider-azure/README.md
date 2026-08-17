# @hobo/provider-azure

The Azure `CloudProvider` (HOBO-712): Container Apps, Cosmos DB, Blob
Storage, PostgreSQL Flexible Server, Service Bus, and Cache for Redis behind
HoBo's agnostic ports — the Azure row of the cross-cloud equivalence table
shipped as this provider's default Resource Definitions. This is the cloud
the design's worked example names (`defaultProvider: azure({ region:
"eastus" })`).

| Port | Azure service | Resource class |
|---|---|---|
| `compute` | Container Apps | `azure:container-app` |
| `kv` | Cosmos DB (Table) | `azure:cosmos-table` |
| `objectStore` | Blob Storage | `azure:storage-blob-container` |
| `database` | PostgreSQL Flexible Server | `azure:postgres-flexible-server` |
| `queue` | Service Bus | `azure:servicebus-queue` |
| `cache` | Cache for Redis | `azure:cache-redis` |

- **Factory** `createAzureProvider({ regions })` (HOBO-87 authoring contract).
- **`.with()` builders**: `azure.with.containerApps / postgres / blob /
  cosmos / serviceBus / redis` — typed, additive, inert for non-resolved
  providers.
- **`realize()`** emits a `hobo.iac-program/v1` program for the primary
  Pulumi lane (`stack: azure/<deploymentId>`), with `binding` outputs so bind
  edges resolve across resources.
- **Keyless creds**: the published auth document pins `svid-federation` via
  Entra workload identity federation (HOBO-110) — `staticSecrets: false` is
  parse-enforced.
- **Cost facts**: declared real list-price magnitudes per SKU with monthly
  free-tier facts.
- Installable into the composed registry with `hobo add azure` (held/approve
  semantics per HOBO-710).

## Verification

```sh
pnpm --filter @hobo/provider-azure build
pnpm --filter @hobo/provider-azure test
```

## Default Yard catalog (what Azure *can* allocate)

`azureYardSpec()` and `AZURE_DEFAULT_BINDINGS` (`src/default-yard.ts`) declare
the Azure Yard as an **allocatable catalog**: for each capability slot, every
Azure product that could satisfy it. It is not a mapping, not a pool, and not a
selection — a slot commonly lists several alternatives, and which one an app
gets is decided later by capability selection (ADR-0151) against the
requirements the app states.

| Slot | Declared alternatives |
|---|---|
| `web` | Static Web Apps (`web.static/v1`), App Service, Container Apps, AKS (all `web.hosted/v1`) |
| `api` | API Management (`api.http/v1`) |
| `service` | Functions, Container Apps (`service.worker/v1`) |
| `data` | PostgreSQL Flexible Server (`data.postgres/v1`), SQL Database (`data.relational/v1`), Cosmos DB (`data.document/v1`) |
| `kv` | Cosmos DB Table (`kv.key-value/v1`), Cache for Redis (`kv.redis-compatible/v1`) |
| `bucket` | Blob Storage (`bucket.object/v1`) |
| `queue` | Storage Queue (`queue.at-least-once/v1`), Service Bus queue (`queue.fifo/v1`) |
| `topic` | Service Bus topic (`topic.pubsub/v1`) |
| `secretRef` | Key Vault (`secret-ref.locator/v1`) |

Rows are authored through the typed factories in `src/slots.ts` (one factory
per `(slot, profile, productId)` triple, each with its own options interface).
`azureYardSpec({ regions })` returns raw row-shaped data — `{ provider,
regions, bindings }` — because a provider package is a layer-2 adapter and may
not import `@hobo/yards`; that layer-3 package parses these rows into a
canonical set.

## HONEST SCOPE — catalog only, nothing here deploys

This change ships the **catalog only**. There is no HTTP deployment resolver
for Azure in this package (Cloudflare and Vercel are the two providers with
resolvers today), and the `azure.*` product ids the factories emit are **not
registered** in the definition catalog. A Yard built from this spec declares
what Azure *can* allocate; attempting to deploy against it **fails closed at
resolution** — `YARD_BINDING_PRODUCT_UNKNOWN`, or no registered resolver —
until Resource Definitions and resolvers land. Nothing in this section should
be read as evidence that an Azure deployment works.
