# @hobo/provider-aws

The AWS `CloudProvider` (HOBO-711): RDS PostgreSQL, S3, Fargate, SQS,
ElastiCache, and DynamoDB behind HoBo's agnostic ports — the AWS row of the
cross-cloud equivalence table shipped as this provider's default Resource
Definitions.

| Port | AWS service | Resource class |
|---|---|---|
| `compute` | Fargate | `aws:fargate-service` |
| `kv` | DynamoDB | `aws:dynamodb-table` |
| `objectStore` | S3 | `aws:s3-bucket` |
| `database` | RDS PostgreSQL | `aws:rds-postgres` |
| `queue` | SQS | `aws:sqs-queue` |
| `cache` | ElastiCache (Redis) | `aws:elasticache-redis` |

- **Factory** `createAwsProvider({ regions })` (HOBO-87 authoring contract).
- **`.with()` builders**: `aws.with.fargate / rds / s3 / dynamodb / sqs /
  elasticache` — typed, additive, inert for non-resolved providers.
- **`realize()`** emits a `hobo.iac-program/v1` program for the primary
  Pulumi lane (`stack: aws/<deploymentId>`), with `binding` outputs so bind
  edges resolve across resources.
- **Keyless creds**: the published auth document pins `svid-federation` via
  `sts:AssumeRoleWithWebIdentity` (HOBO-110) — `staticSecrets: false` is
  parse-enforced.
- **Cost facts**: declared real list-price magnitudes per SKU with monthly
  free-tier facts.
- Installable into the composed registry with `hobo add aws` (held/approve
  semantics per HOBO-710).

## Verification

```sh
pnpm --filter @hobo/provider-aws build
pnpm --filter @hobo/provider-aws test
```

## Default Yard catalog (what AWS *can* allocate)

`awsYardSpec()` and `AWS_DEFAULT_BINDINGS` (`src/default-yard.ts`) declare the
AWS Yard as an **allocatable catalog**: for each capability slot, the AWS
products that could satisfy it. It is not a mapping, not a pool, and not a
selection — each slot holds a *list*, and which entry an app gets is decided
later by capability selection (ADR-0151) against the requirements the app
states.

| Slot | Declared alternatives |
|---|---|
| `web` | App Runner, ECS service, EKS Deployment, Amplify Hosting (`web.hosted/v1`); S3 + CloudFront (`web.static/v1`) |
| `api` | API Gateway (`api.http/v1`) |
| `service` | Lambda (`service.worker/v1`); ECS task (`service.batch/v1`) |
| `data` | RDS for PostgreSQL, Aurora Serverless v2 (`data.postgres/v1`); RDS for MySQL (`data.mysql/v1`); DynamoDB (`data.document/v1`) |
| `kv` | DynamoDB (`kv.key-value/v1`); ElastiCache (`kv.redis-compatible/v1`) |
| `bucket` | S3 (`bucket.s3-compatible/v1`) |
| `queue` | SQS (`queue.at-least-once/v1`); SQS FIFO (`queue.fifo/v1`) |
| `topic` | SNS (`topic.pubsub/v1`) |
| `secretRef` | Secrets Manager, SSM Parameter Store (`secret-ref.locator/v1`) |

The catalog is built strictly from the typed factories in `src/slots.ts`. Most
slots hold several entries, because AWS genuinely hosts a web capability four
ways and satisfies `data` with three different engines. Which one a given
workload gets is decided at resolution time by ADR-0151 selection, against the
requirements the app states — never here. Adding a fifth `web` option is a
catalog edit, not a deployment change.

The catalog still does not enumerate all of AWS. Lightsail, Elastic Beanstalk,
Kinesis, MSK, Neptune, and others are not authored yet; a missing alternative is
a gap in the factory set, not a choice made by the Yard.

`awsYardSpec({ regions })` returns raw row-shaped data — `{ provider, regions,
bindings }` — because a provider package is a layer-2 adapter and may not
import `@hobo/yards`; that layer-3 package parses these rows into a canonical
set.

## HONEST SCOPE — catalog only, nothing here deploys

This change ships the **catalog only**. There is no HTTP deployment resolver
for AWS in this package (Cloudflare and Vercel are the two providers with
resolvers today), and the `aws.*` product ids the factories emit are **not
registered** in the definition catalog. A Yard built from this spec declares
what AWS *can* allocate; attempting to deploy against it **fails closed at
resolution** — `YARD_BINDING_PRODUCT_UNKNOWN`, or no registered resolver —
until Resource Definitions and resolvers land. Nothing in this section should
be read as evidence that an AWS deployment works.
