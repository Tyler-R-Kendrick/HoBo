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
