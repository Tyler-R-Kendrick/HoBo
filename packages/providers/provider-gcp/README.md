# @hobo/provider-gcp

The GCP `CloudProvider` (HOBO-713): Cloud Run, Firestore, Cloud Storage,
Cloud SQL PostgreSQL, Pub/Sub, and Memorystore behind HoBo's agnostic ports —
the GCP row of the cross-cloud equivalence table shipped as this provider's
default Resource Definitions. Completes the big-three hyperscaler set behind
one negotiation shape.

| Port | GCP service | Resource class |
|---|---|---|
| `compute` | Cloud Run | `gcp:cloud-run-service` |
| `kv` | Firestore | `gcp:firestore-database` |
| `objectStore` | Cloud Storage | `gcp:gcs-bucket` |
| `database` | Cloud SQL PostgreSQL | `gcp:cloud-sql-postgres` |
| `queue` | Pub/Sub | `gcp:pubsub-topic` |
| `cache` | Memorystore (Redis) | `gcp:memorystore-redis` |

- **Factory** `createGcpProvider({ regions })` (HOBO-87 authoring contract).
- **`.with()` builders**: `gcp.with.cloudRun / cloudSql / gcs / firestore /
  pubsub / memorystore` — typed, additive, inert for non-resolved providers.
- **`realize()`** emits a `hobo.iac-program/v1` program for the primary
  Pulumi lane (`stack: gcp/<deploymentId>`), with `binding` outputs so bind
  edges resolve across resources.
- **Keyless creds**: the published auth document pins `svid-federation` via
  GCP Workload Identity Federation (HOBO-110) — `staticSecrets: false` is
  parse-enforced.
- **Cost facts**: declared real list-price magnitudes per SKU with monthly
  free-tier facts.
- Installable into the composed registry with `hobo add gcp` (held/approve
  semantics per HOBO-710).

## Verification

```sh
pnpm --filter @hobo/provider-gcp build
pnpm --filter @hobo/provider-gcp test
```
