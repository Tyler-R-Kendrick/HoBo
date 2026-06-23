# Encore — infrastructure-from-code

> Part of the [Encore reference](./README.md). How Encore turns in-code resource declarations into provisioned infra. Source: [encore.dev/blog/what-is-infrastructure-from-code](https://encore.dev/blog/what-is-infrastructure-from-code) · [encore.cloud/features/automatic-infrastructure](https://encore.cloud/features/automatic-infrastructure) — summarized for analysis.

## The IfC loop
1. **Declare** resources as objects in your TS/Go code, in the same files that use them — a SQL database, a pub/sub topic, a bucket, a cache, a cron job, a secret, an API/service.
2. **Compile/parse.** Encore's compiler statically analyzes the declarations to build an **application graph** (services, APIs, and the infra each needs) — no separate IaC file.
3. **Provision.** Encore maps each declared resource to a **production-grade managed service** in your AWS or GCP account (e.g. RDS/Cloud SQL for databases, SNS+SQS/Pub-Sub for topics, S3/GCS for buckets, ElastiCache/Memorystore for caches) and wires connection settings + IAM automatically.

## Declarable resources (the catalog)
| Resource | Encore declares | Provisioned to (AWS / GCP) |
|---|---|---|
| **SQL database** | `new SQLDatabase(...)` + migrations | RDS / Cloud SQL (Postgres) |
| **Pub/Sub** | topics + subscriptions with delivery guarantees | SNS+SQS / Pub/Sub |
| **Object storage** | versioned buckets | S3 / GCS |
| **Caching** | Redis-compatible keyspaces | ElastiCache / Memorystore |
| **Cron** | scheduled jobs | platform scheduler |
| **Secrets** | secret values referenced in code | Secrets Manager / Secret Manager |
| **APIs / services** | type-safe service-to-service calls | service mesh / IAM wiring |

## Why this is the closest analog to HoBo
This is **exactly HoBo's IfC stance** ([Plan 21](../../docs/design/authoring-resources-wiring.md#plan-21) resource catalog + [Plan 22](../../docs/design/authoring-resources-wiring.md#plan-22) wiring/manifest): declare resources inline, let the platform collect them into a graph and provision them, with connection info injected (never hand-wired). Encore validates the model in production at scale.

## Where Encore stops (and HoBo continues)
- **Two clouds, owned provisioning.** Encore provisions to **AWS or GCP** via its own engine. HoBo is **provider-agnostic across many clouds + IaC tools** (Pulumi/Crossplane/Terraform/OpenTofu are pluggable adapters, [Plan 3](../../docs/design/control-plane.md#plan-03)), and supports **per-resource/per-tier/per-cloud mapping** + typed provider-native `.with(...)` escape hatches.
- **No platform-rules layer.** Encore's mapping is fixed; HoBo adds **Resource Definitions + Matching** ([Plan 25](../../docs/design/platform-engineering.md#plan-25)) so platform engineers can realize the *same* declaration differently per environment (cheap preview vs managed-HA prod), with the choice **audited** (`match.Decided`, [ADR-0033](../../docs/design/adr/05-config-matching-environments.md#adr-0033)).
- **No cross-cloud data/migration/consistency model**, no wasm runtime, no event-sourced control plane, no Forge — see [`differentiators.md`](./differentiators.md).
