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
