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

## Default Yard catalog (what GCP *can* allocate)

`gcpYardSpec()` and `GCP_DEFAULT_BINDINGS` (`src/default-yard.ts`) declare the
GCP Yard as an **allocatable catalog**: for each capability slot, every Google
Cloud product that could satisfy it. It is not a mapping, not a pool, and not a
selection — a slot commonly lists several alternatives, and which one an app
gets is decided later by capability selection (ADR-0151) against the
requirements the app states.

| Slot | Declared alternatives |
|---|---|
| `web` | Cloud Run, App Engine (`web.hosted/v1`), Cloud Storage site (`web.static/v1`) |
| `api` | API Gateway (`api.http/v1`) |
| `service` | Cloud Functions (`service.worker/v1`), Cloud Run job (`service.batch/v1`) |
| `data` | Cloud SQL for PostgreSQL (`data.postgres/v1`), Cloud SQL for MySQL (`data.mysql/v1`), Firestore (`data.document/v1`) |
| `kv` | Memorystore for Redis (`kv.redis-compatible/v1`) |
| `bucket` | Cloud Storage (`bucket.object/v1`) |
| `queue` | Cloud Tasks (`queue.at-least-once/v1`) |
| `topic` | Pub/Sub (`topic.pubsub/v1`) |
| `secretRef` | Secret Manager (`secret-ref.locator/v1`) |

Rows are authored through the typed factories in `src/slots.ts` (one factory
per `(slot, profile, productId)` triple, each with its own options interface).
`gcpYardSpec({ regions })` returns raw row-shaped data — `{ provider, regions,
bindings }` — because a provider package is a layer-2 adapter and may not
import `@hobo/yards`; that layer-3 package parses these rows into a canonical
set.

## HONEST SCOPE — catalog only, nothing here deploys

This change ships the **catalog only**. There is no HTTP deployment resolver
for GCP in this package (Cloudflare and Vercel are the two providers with
resolvers today), and the `gcp.*` product ids the factories emit are **not
registered** in the definition catalog. A Yard built from this spec declares
what GCP *can* allocate; attempting to deploy against it **fails closed at
resolution** — `YARD_BINDING_PRODUCT_UNKNOWN`, or no registered resolver —
until Resource Definitions and resolvers land. Nothing in this section should
be read as evidence that a GCP deployment works.
