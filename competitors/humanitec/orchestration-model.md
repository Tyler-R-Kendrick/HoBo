# Humanitec — Orchestration Model (Score, Resource Definitions, Matching, Graph, Sets/Deltas)

> Part of the [Humanitec competitor reference](./README.md). The core engine, with quoted/illustrative YAML excerpts (see the [fair-use note](../README.md#sources--fair-use)).

## Score — the workload spec (developer intent)
Open, platform-agnostic (CNCF Sandbox; created by Humanitec). Developers write `score.yaml` once; it specifies containers, service ports, and abstract resource dependencies.
```yaml
apiVersion: score.dev/v1b1
metadata:
  name: my-app
containers:
  my-container:
    image: my-app:latest
    variables:
      DATABASE_URL: "postgres://${resources.db.username}:${resources.db.password}@${resources.db.host}:${resources.db.port}/${resources.db.name}"
    resources:
      limits: { cpu: "0.5", memory: "512Mi" }
      requests: { cpu: "0.1", memory: "128Mi" }
service:
  ports:
    http: { port: 8080, targetPort: 3001 }
resources:
  db:    { type: postgres, class: standard, id: shared.primary }
  dns:   { type: dns }
  s3:    { type: s3, class: private, id: data-bucket }
```
A companion `humanitec.score.yaml` carries Humanitec-specific extensions (workload profile, annotations, overrides). The same `score.yaml` deploys to any environment unchanged.

## Resource Definitions — platform config (how a resource is provisioned)
Platform-engineer-authored rules: for an abstract `type` (+ optional `class`), which **driver**, what **inputs**, and the **matching criteria** that select this definition.
```yaml
apiVersion: entity.humanitec.io/v1b1
kind: Definition
metadata: { id: postgres-prod-ha }
entity:
  name: postgres-prod-ha
  type: postgres
  driver_type: humanitec/terraform
  driver_inputs:
    values:
      tf_code: |
        resource "aws_db_instance" "main" {
          identifier     = "${context.app.id}-${context.env.id}-db"
          engine         = "postgres"
          instance_class = "db.r6g.large"
          multi_az       = true
        }
        output "host" { value = aws_db_instance.main.address }
  criteria:
    - env_type: production
      resource_class: high-availability
```

## Matching & Matching Criteria (specificity scoring)
For a needed resource in context `{env_type, app_id, env_id, resource_type, resource_class, resource_id}`, the Orchestrator gathers all definitions of that type, evaluates each definition's criteria, **scores by specificity**, and selects the highest. Criteria fields: `env_type`, `app_id`, `env_id`, `resource_id`, `resource_class`. Example scoring:
```yaml
- {}                                                  # score 0 (catch-all)
- env_type: production                                # score 1
- env_type: production, resource_class: ha            # score 2
- env_type: production, app_id: critical, resource_class: ha  # score 3 (wins)
```
All listed fields in a criterion must match; most specific wins; ties broken by next-most-specific.

## Resource Graph (DAG)
A per-deployment DAG; nodes = resource instances, edges = dependencies.
- **Implicit resources** (auto): `workload`, `base-env`, `k8s-cluster`, `k8s-namespace`.
- **Dependent resources**: those Score requests.
- **Co-provisioned resources**: extra resources a Resource Definition provisions together (e.g. an S3 bucket + its IAM policy).
- Resources are identified by the triple **`(type, class, id)`**; shared resources use `id: shared.<name>` and are provisioned once and reused across workloads.
- References create edges + flow outputs: `${resources.postgres.standard#shared.primary.outputs.host}`. The graph is topologically ordered; independent nodes provision in parallel; idempotent retries (≈2).

## Placeholders
- Context: `${context.app.id}`, `${context.env.id}`, `${context.env.type}`, `${context.res.id}`, `${context.res.class}`, `${context.res.type}`.
- Resource outputs: `${resources.<type>.<class>#<id>.outputs.<name>}`.
- Implicit: `${implicit.k8s.namespace}`.

## Applications, Environments, Environment Types
- **Application** = logical grouping of workloads + shared resources (org-level).
- **Environment** = an instance of an app with its own config; has an **Environment Type** (`development`/`staging`/`production`/custom) — the primary matching dimension.
- **Cloning**: a new environment can be cloned from one with a prior successful deployment (creates a draft Delta).
- **Ephemeral / dynamic environments**: per-PR/feature, created + torn down via CI; platform engineers map cheap variants (in-cluster DB, serverless) to ephemeral via matching.

## Deployment Sets & Deltas
- **Deployment Set** = an immutable, complete configuration snapshot (`modules` + `shared`) for an app at a point in time.
- **Deployment Delta** = a mutable draft diff (create/update/delete modules/resources) applied to a Set; can be combined/reviewed before committing.
- **Flow:** Score → generate **Delta** → review/approve → apply to create a new **Set** → execute drivers → record immutable Deployment (audit).
- **Rollback** = re-apply a previous Deployment's Set + graph; stateful resources keep state. **Incremental deployments** (2026): update only changed resources.

## Deployment workflow (`humctl`)
```bash
humctl score deploy -f score.yaml --org O --app A --env prod --image my-app:v1 --message "..." --wait
humctl deploy delta <DELTA_ID> <ENV> --app A
humctl create env <ENV> --type production --from <SRC_ENV>   # clone
humctl rollback <ENV> --app A
humctl get deployments --app A --env prod
humctl describe environment --app A --env prod               # resource graph
humctl apply -f resource-definition.yaml
```
REST API base `https://api.humanitec.dev` (Bearer token); endpoints for orgs/apps/envs/deploys/definitions/logs. A Terraform provider (`humanitec/humanitec`) manages Humanitec resources as IaC.

## Shared / active / implicit resources
- **Active resource** = a real provisioned object (RDS instance, bucket, namespace); driver keeps its state across runs; long-lived.
- **Shared resource** (`shared.<name>`) = one active resource reused by multiple workloads in an environment (deduped by `(type,class,id)`).
- **Implicit resources** = auto-provisioned scaffolding (workload/base-env/cluster/namespace).
