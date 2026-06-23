# Humanitec — Competitor Reference

> Captured for HoBo competitive analysis (research as of 2026). This folder documents **Humanitec's Platform Orchestrator** faithfully; the HoBo↔Humanitec parity tracker is in [`hobo-mapping.md`](#hobo-mapping).
>
> Files: [orchestration-model.md](#orchestration-model) · [drivers.md](#drivers) · [platform-ops.md](#platform-ops) · [pricing-positioning.md](#pricing-positioning) · [differentiators.md](#differentiators) · [hobo-mapping.md](#hobo-mapping)

## What it is
The **Platform Orchestrator** is a cloud-agnostic, multi-compute orchestration engine that powers **Internal Developer Platforms (IDPs)**. Developers describe a workload in **Score** (environment-agnostic); platform engineers define **Resource Definitions** (how resources are provisioned); the Orchestrator **dynamically generates** environment-specific configuration at deploy time, enforcing standards/policy without the developer knowing the details. It is *not* a portal, *not* CI/CD, *not* IaC, *not* monitoring — it's the configuration engine at the heart of an IDP.

- **Tagline / framing:** dynamic configuration management; "developers describe *what*, the platform decides *how*."
- **Target users:** developers (write Score) + platform engineers (write Resource Definitions).

## The IDP "5-plane" reference architecture
1. **Developer Control Plane** — workload specs (Score), developer portals (Humanitec Portal, Backstage, custom).
2. **Integration & Delivery Plane** — CI, image registries, **the Platform Orchestrator**, CD.
3. **Resource Plane** — real infra (clusters, DBs, storage, DNS, VMs, serverless).
4. **Monitoring & Logging Plane.**
5. **Security Plane** — secrets, identity, access.
The Orchestrator lives in plane 2 and drives plane 3.

## Core mental model — "RMCD" (Read → Match → Create → Deploy)
```
Developer intent (Score)  +  Platform config (Resource Definitions)
   → READ score → MATCH to context (env_type, app, env, resource_class, resource_id)
   → SELECT best Resource Definition (specificity-scored)
   → BUILD Resource Graph (DAG) → EXECUTE Drivers → RECORD Deployment Set + Delta
```
Single source of truth = Score (*what*) + Resource Definitions (*how*).

## v1 vs v2
- **v1** (legacy): Kubernetes-only, opinionated, complex.
- **v2** (Sept 2025): **compute-agnostic** ("any compute, any cloud" — VMs/K8s/serverless/anything Terraform/OpenTofu can manage), simplified concepts, AI-first; keeps v1's projects/environments/resource-graph abstractions.

## At-a-glance feature list (detailed in sibling files)
- **Resource Definitions + Matching Criteria** (specificity scoring) — the platform-config layer — see [orchestration-model.md](#orchestration-model).
- **Resource Graph** (DAG of implicit + dependent + co-provisioned resources) — see [orchestration-model.md](#orchestration-model).
- **Drivers** (terraform / template / echo / container / custom-webhook) + **Resource Packs** + **Workload Profiles** — see [drivers.md](#drivers).
- **Score** workload spec; **Applications / Environments / Environment Types**; **Deployment Sets** (immutable) + **Deltas** (mutable diff); cloning + ephemeral environments — see [orchestration-model.md](#orchestration-model).
- **Portal**, **Agent** (private-network deploys), **Operator**, **Pipelines**, **GitOps**, **RBAC + approvals**, **secrets**, **audit logs** — see [platform-ops.md](#platform-ops).
- **Pricing/editions** (SaaS + self-hosted + air-gapped), positioning, 2024–26 direction (MCP, self-hosted GA, incremental deploys) — see [pricing-positioning.md](#pricing-positioning).

## Known gaps (opportunities for HoBo)
- Kubernetes-centric; weak native serverless (no first-class Cloud Run/Lambda compute).
- Steep learning curve; opaque pricing; proprietary core.
- Not a full observability platform; relies on external tools.
- Opaque matching selection (no first-class "why this infra" audit).
- No wasm/polyglot-component runtime; no event-sourced replay/time-travel.

See [differentiators.md](#differentiators) for the full strengths/gaps and [hobo-mapping.md](#hobo-mapping) for HoBo's response.

## drivers

**Humanitec — Drivers, Resource Packs & Workload Profiles**

> Part of the [Humanitec competitor reference](humanitec.md). The execution layer that actually provisions resources.

### Drivers (the execution mechanism)
A **Driver** provisions a resource given a Resource Definition's inputs + context, and returns outputs (and optionally K8s manifests).

| Driver | `driver_type` | What it does |
|---|---|---|
| **Terraform** | `humanitec/terraform` | Runs Terraform/OpenTofu (inline `tf_code` or Git module); manages state; any TF provider. GA. |
| **Template** | `humanitec/template` | Renders Go templates → Kubernetes manifests (Namespace, Service, Ingress, CRDs, quotas…). |
| **Echo** | `humanitec/echo` | Passes inputs through as outputs unchanged — for **externally-managed** resources Humanitec reads but doesn't provision. |
| **Container** | `humanitec/container` | Runs a K8s Job for complex/custom provisioning (Pulumi, CloudFormation, scripts); a sidecar `outputs-fetcher` reads the outputs JSON. |
| **Custom (webhook)** | `custom/<name>` | Calls a self-hosted HTTP service (signed JWT payload); returns outputs JSON + optional manifests. Any tech stack. |

#### Driver interface (conceptual)
**Input:**
```json
{ "context": {"app_id":"my-app","env_id":"prod","env_type":"production",
              "res_id":"shared.primary","res_type":"postgres","res_class":"ha"},
  "driver_inputs": {"tf_code":"...","instance_class":"db.r6g.large"},
  "old_state": { } }
```
**Output:**
```json
{ "outputs": {"host":"...","port":5432,"username":"...","password":"...","connection_string":"..."},
  "manifests": [ { "apiVersion":"v1","kind":"Secret", "...":"..." } ] }
```
Custom drivers are registered with type + input-schema (JSON) + URL + supported account credentials. Humanitec publishes an open-source driver library (AWS/GCP/Azure) + community contributions.

### Resource Packs
Pre-built collections of Resource Definitions for common use cases (AWS, GCP, Azure, in-cluster). Typically use the Terraform or Template driver. Imported into an org and customized via matching criteria. Marketplace at humanitec.com/marketplace. Used to jump-start platform setup.

### Workload Profiles
A template for **how a workload is realized** (e.g. Kubernetes Deployment vs serverless vs batch job). Built-in `container` (default K8s); custom profiles defined via a spec + Helm chart. Selected when generating the Deployment Set; influences the produced manifests. Enables Dapr services, gRPC servers, batch jobs, etc.

### Notable
- Co-provisioning: one Resource Definition can create several resources + the edges between them.
- The Container/Custom drivers are how Humanitec stays IaC-agnostic (Terraform, Pulumi, CloudFormation, or anything HTTP-callable).

## orchestration-model

**Humanitec — Orchestration Model (Score, Resource Definitions, Matching, Graph, Sets/Deltas)**

> Part of the [Humanitec competitor reference](humanitec.md). The core engine, with quoted/illustrative YAML excerpts (see the [fair-use note](README.md#sources--fair-use)).

### Score — the workload spec (developer intent)
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

### Resource Definitions — platform config (how a resource is provisioned)
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

### Matching & Matching Criteria (specificity scoring)
For a needed resource in context `{env_type, app_id, env_id, resource_type, resource_class, resource_id}`, the Orchestrator gathers all definitions of that type, evaluates each definition's criteria, **scores by specificity**, and selects the highest. Criteria fields: `env_type`, `app_id`, `env_id`, `resource_id`, `resource_class`. Example scoring:
```yaml
- {}                                                  # score 0 (catch-all)
- env_type: production                                # score 1
- env_type: production, resource_class: ha            # score 2
- env_type: production, app_id: critical, resource_class: ha  # score 3 (wins)
```
All listed fields in a criterion must match; most specific wins; ties broken by next-most-specific.

### Resource Graph (DAG)
A per-deployment DAG; nodes = resource instances, edges = dependencies.
- **Implicit resources** (auto): `workload`, `base-env`, `k8s-cluster`, `k8s-namespace`.
- **Dependent resources**: those Score requests.
- **Co-provisioned resources**: extra resources a Resource Definition provisions together (e.g. an S3 bucket + its IAM policy).
- Resources are identified by the triple **`(type, class, id)`**; shared resources use `id: shared.<name>` and are provisioned once and reused across workloads.
- References create edges + flow outputs: `${resources.postgres.standard#shared.primary.outputs.host}`. The graph is topologically ordered; independent nodes provision in parallel; idempotent retries (≈2).

### Placeholders
- Context: `${context.app.id}`, `${context.env.id}`, `${context.env.type}`, `${context.res.id}`, `${context.res.class}`, `${context.res.type}`.
- Resource outputs: `${resources.<type>.<class>#<id>.outputs.<name>}`.
- Implicit: `${implicit.k8s.namespace}`.

### Applications, Environments, Environment Types
- **Application** = logical grouping of workloads + shared resources (org-level).
- **Environment** = an instance of an app with its own config; has an **Environment Type** (`development`/`staging`/`production`/custom) — the primary matching dimension.
- **Cloning**: a new environment can be cloned from one with a prior successful deployment (creates a draft Delta).
- **Ephemeral / dynamic environments**: per-PR/feature, created + torn down via CI; platform engineers map cheap variants (in-cluster DB, serverless) to ephemeral via matching.

### Deployment Sets & Deltas
- **Deployment Set** = an immutable, complete configuration snapshot (`modules` + `shared`) for an app at a point in time.
- **Deployment Delta** = a mutable draft diff (create/update/delete modules/resources) applied to a Set; can be combined/reviewed before committing.
- **Flow:** Score → generate **Delta** → review/approve → apply to create a new **Set** → execute drivers → record immutable Deployment (audit).
- **Rollback** = re-apply a previous Deployment's Set + graph; stateful resources keep state. **Incremental deployments** (2026): update only changed resources.

### Deployment workflow (`humctl`)
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

### Shared / active / implicit resources
- **Active resource** = a real provisioned object (RDS instance, bucket, namespace); driver keeps its state across runs; long-lived.
- **Shared resource** (`shared.<name>`) = one active resource reused by multiple workloads in an environment (deduped by `(type,class,id)`).
- **Implicit resources** = auto-provisioned scaffolding (workload/base-env/cluster/namespace).

## platform-ops

**Humanitec — Platform, Operations & Governance**

> Part of the [Humanitec competitor reference](humanitec.md). Portal, Agent, CI/CD, RBAC, secrets, observability, extensibility.

### Portal / developer self-service
Web UI atop the Orchestrator: self-service environments/deployments, app status, resource-graph visualization, drift detection. Platform engineers do resource management/setup here. Features: **golden paths / paved roads** (platform rules developers follow declaratively via Score), service catalogs, dashboards, self-service templates/scaffolding, **scorecards** (health/compliance, DORA metrics), RBAC, automated docs/audit. The Portal is **optional/modular** — teams can use API/CLI or other portals (Backstage, Port.io) instead. Humanitec frames Portal vs Orchestrator as a clean separation: the Orchestrator is the engine; the portal is one surface.

### The Humanitec Agent
A lightweight proxy inside the customer's private network so the **SaaS** Orchestrator can deploy into **private/air-gapped** clusters **without inbound access**:
- **Reverse tunnel:** Agent makes an **outbound TCP 443** connection to Humanitec; no open ports/exposed endpoints.
- TLS-encrypted, authenticated; credentials stay in-network; the Orchestrator never connects directly to private clusters — all proxying goes through the Agent.
- Installed as a K8s agent; one Agent can manage multiple clusters; used for private K8s, multi-region/multi-cloud, regulated/air-gapped environments. Also enables a GitOps mode where the Agent pulls runtime data.

### Humanitec Operator
Separate from the Agent; a K8s operator on each cluster (public or private) managing CRDs and provisioning **Secrets** from secret stores (Vault, Azure Key Vault, Infisical, native K8s). Helm-installed controller-manager acts on resource changes.

### CI/CD & Pipelines
- Works with **any** CI (GitHub Actions, GitLab, Bitbucket, CircleCI, Jenkins, Codefresh). Pattern: CI builds image → notifies Orchestrator of new artifact → Orchestrator deploys (via `humctl score deploy --image <ver>` or webhook, using a service-user token).
- **Humanitec Pipelines** (feature): multi-step deployment workflows. Triggers: **Deployment Request** (new artifacts matching criteria) and **API**. **Deployment rules** are if-then (e.g. "new image from dev HEAD → deploy dev-testing"); flexible image matching/exclusion. Jobs run in parallel with `needs` for ordering; max ~10 concurrent runs; custom `concurrency` locks. Integrate policy checks, sign-offs, Slack/Teams notifications.
- **GitOps mode:** Orchestrator writes the Resource Graph as K8s Custom Resources to a Git repo/branch; ArgoCD/Flux sync to clusters. Can run standalone or hybrid.

### Deployment targets
Kubernetes-centric (EKS/GKE/AKS/on-prem/private). Cloud resources via **Terraform driver** (any TF provider), **Template driver** (K8s), **Container driver** (Pulumi/CFN/custom). v2 extends to "any compute" (VMs/serverless) but K8s remains primary; native serverless (Cloud Run/Lambda as primary compute) is limited.

### RBAC, governance, approvals
- **RBAC** (GA 2025) at **Organization / Application / Environment-Type** levels; least-privilege default; roles like admin/developer/ops/delivery-manager/approver/viewer.
- **Approvals/sign-offs** via Pipelines + webhooks (e.g. notify Slack pre-prod, delivery manager confirms prod). Policy checks run automatically pre-deploy. Standardization by design (devs declare *what*, platform enforces *how*).

### Secrets management
Secrets are a resource type whose outputs inject into containers at runtime; never logged or persisted in manifests/Git. Stores: **Vault** (KV v2, dynamic creds), **Azure Key Vault**, **Infisical**, **native K8s**. Shared values/secrets scoped to app/environment with overrides.

### Observability, status, audit
- Deployment status tab (active deployment + workloads + shared resources); resource-status health via the Operator; plan-only & historical resource graphs (2026).
- **Drift detection** (TF provider): desired (graph) vs actual; alerts on config drift.
- Scorecards + DORA metrics; integrates external monitoring (Prometheus/Datadog) via resource definitions. Not a full observability platform.
- **Audit log:** every API change on every entity, who/when/action; min **365-day** retention, immutable; **no request bodies / no IPs**; up to ~5-min delay.

### Extensibility & API
- **Drivers** = the core extension (HTTP PUT/DELETE implementing the driver interface; any stack; embed TF/Pulumi/CFN/custom). **Resource Packs** bundle definitions; open-source driver library.
- REST API for all entities; **webhooks** (env create/delete, deploy start/complete; customizable payloads with variable substitution); Terraform provider; **MCP** support (Jan 2026) so AI agents drive the Orchestrator.

## pricing-positioning

**Humanitec — Editions, Positioning & Recent Direction**

> Part of the [Humanitec competitor reference](humanitec.md).

### Editions & deployment models
- **SaaS (cloud-hosted):** fully managed, multi-tenant; uses the Agent for private-cluster access.
- **Self-hosted (GA Dec 2025):** entire Orchestrator on customer infra; data sovereignty, **air-gapped** support; regulated industries (banking/insurance/gov/defense), GovCloud/sovereign clouds.
- **Free / community:** free trial (no card); a free community version is mentioned (limits not fully public).
- **Pricing:** not publicly disclosed — demo/contact required (an adoption + comparison friction point).

### Positioning vs adjacent tools (Humanitec's framing)
- **vs Backstage** — complementary, not competitive. Backstage = developer **portal** (catalog/scaffolding, OSS framework); Humanitec = **backend orchestrator** (config generation, provisioning). "Deploy Humanitec first, layer Backstage on top." Humanitec argues Backstage is framework-heavy DIY.
- **vs Terraform / Pulumi** — Humanitec is the **orchestration layer above** IaC: it *orchestrates and standardizes* TF execution via drivers (declarative + policy-driven) rather than replacing it.
- **vs Crossplane** — Crossplane is a K8s-native control plane (CRDs); Humanitec is broader app+infra orchestration not requiring K8s-CRD modeling of everything.
- **vs ArgoCD / Flux** — GitOps operators sync Git→cluster; Humanitec **generates** what to sync (and adds multi-stage workflows, approvals, policy) then can hand off to Argo/Flux.
- **vs Qovery / Northflank / Nitric** — those are simpler PaaS/serverless-first; Humanitec is enterprise-grade orchestration with deep policy/governance and a single app+infra graph (more upfront config, more control).

### Stated strengths
Dynamic resource graph; true developer self-service (intent → platform applies rules); policy/governance (RBAC, approvals, drift, audit); multi-env/multi-cloud/multi-cluster; production-ready (SaaS + self-hosted); IaC-agnostic (TF/Pulumi/CFN/custom drivers); proven in regulated/air-gapped enterprises.

### Gaps / criticism (competitor openings)
- Steep learning curve; many interlocking concepts (Resource Types/Definitions/Drivers/Runners/Manifests); docs lag features.
- Kubernetes-centric; limited native serverless; assumes containerized workloads.
- Opaque pricing; proprietary core (vs OSS Backstage).
- Not a full observability platform.
- Vendor lock-in risk (Humanitec Manifests), though Score is open.
- Audit limits (no request bodies/IPs, ~5-min delay); opaque matching selection.

### Recent direction (2024–2026)
- **Sept 2025:** Orchestrator **v2** — compute-agnostic, simplified, AI-first.
- **Dec 2025:** self-hosted Orchestrator GA (regulated/sovereign unlock).
- **Jan 2026:** **MCP** integration — AI agents (Claude/ChatGPT) drive the Orchestrator.
- **Aug 2025:** Container Driver. **2026:** **incremental deployments** (update only changed resources); plan-only & historical resource graphs.
- Strategic shift: "K8s orchestrator" → "any-compute orchestrator"; "DevOps tool" → "AI-integrated developer platform".

### What this means for HoBo
Humanitec is mature, enterprise-grade, and now explicitly **AI-first** — so HoBo can't win on "AI-native" alone. HoBo must combine Humanitec's best engine (Resource Definitions + Matching, drivers, sets/deltas, governance) with what Humanitec lacks: a **wasm-first polyglot runtime**, **event-sourced replay/time-travel + auditable matching decisions**, **Forge-generated definitions/implementations**, **IfC-default simplicity**, and an **OSS core**. See [hobo-mapping.md](#hobo-mapping).

## differentiators

**Humanitec — Differentiators & Gaps (quick reference)**

> Part of the [Humanitec competitor reference](humanitec.md). Condensed; full positioning in [pricing-positioning.md](#pricing-positioning).

### Differentiators (what's genuinely strong)
1. **Dynamic configuration management** — Score (intent) + Resource Definitions (rules) + **Matching** → environment-specific config generated at deploy time. The cleanest dev-vs-platform separation in the market.
2. **Resource Graph** — a real, queryable DAG of app + infra with co-provisioning and output flow; topologically executed.
3. **Driver model** — IaC-agnostic execution (terraform/template/echo/container/custom-webhook); extend by HTTP.
4. **Deployment Sets + Deltas** — immutable snapshots + mutable diffs → clean promote/rollback/preview + incremental deploys.
5. **Governance** — RBAC (org/app/env-type), approval workflows, drift detection, immutable audit.
6. **Enterprise reach** — SaaS + self-hosted + air-gapped; the Agent for private networks; regulated/sovereign markets.
7. **Ecosystem** — Resource Packs, open Score spec, Terraform provider, open-source drivers, MCP (AI agents).

### Gaps (HoBo's openings)
1. **K8s-centric; weak serverless** — no first-class Cloud Run/Lambda compute → HoBo leads with **wasm components + OCI fallback**, polyglot.
2. **Steep learning curve** — many concepts → HoBo's **IfC-default** authoring + mapping-as-sugar keeps the simple path simple.
3. **Opaque pricing + proprietary** → HoBo **OSS core**, self-host = hosted.
4. **Opaque matching selection** → HoBo records **`match.Decided`** events ("why this infra"), replayable.
5. **No event-sourcing/replay/time-travel** → HoBo's core is event-sourced (audit + DR + run inspector).
6. **Human-authored Resource Definitions/Packs** → HoBo's **Forge** can AI-generate definitions + packs, gated by conformance.
7. **Not a full observability platform** → HoBo bundles run inspector/traces/replay.
8. **Vendor lock-in (Manifests)** → HoBo ports are **WIT interfaces** (standards-based); Score importable for interop.

> Net: Humanitec proves the orchestrator abstraction and governance; HoBo adopts that engine and adds a polyglot wasm runtime, event-sourced auditability, AI-native generation, and OSS openness.

## hobo-mapping

**Humanitec → HoBo parity & mapping tracker**

> For every Humanitec feature, the HoBo equivalent and the design doc that owns it. ✅ = designed at parity · ➕ = HoBo goes further · 🔜 = planned/roadmap. HoBo design lives in [`../../docs/design/`](../docs/design/README.md).

### Core engine
| Humanitec | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Dynamic configuration management (Score + Resource Definitions + Matching) | **Resource Definitions + Matching** as the Planner's platform-rules layer; mapping = sugar over default definitions | ✅➕ | [25](../docs/design/platform-engineering.md#plan-25) |
| Resource Definition | HoBo Resource Definition (**WIT-interface-typed**, Forge-generatable) | ➕ | [25](../docs/design/platform-engineering.md#plan-25) |
| Matching Criteria (specificity scoring) | Same model; the winning definition + score recorded as a **`match.Decided`** event (auditable "why this infra") | ➕ | [25](../docs/design/platform-engineering.md#plan-25), [11](../docs/design/event-model.md#plan-11) |
| Resource classes (`standard`/`ha`/…) | Resource `class` as a matching dimension | ✅ | [21](../docs/design/authoring-resources-wiring.md#plan-21) |
| Resource Graph (DAG, co-provision, outputs) | DeploymentPlan DAG + ResourceActors + manifest links | ✅ | [03](../docs/design/control-plane.md#plan-03), [04](../docs/design/control-plane.md#plan-04) |
| Drivers (terraform/template/echo/container/custom-webhook) | **Driver taxonomy** generalizing IaC adapters (incl. echo/BYO + webhook) | ✅ | [27](../docs/design/platform-engineering.md#plan-27), [03](../docs/design/control-plane.md#plan-03) |
| Deployment Sets (immutable) + Deltas (mutable) | **Set = manifest IR**, **Delta = event-sourced diff**; promote/rollback/incremental | ✅➕ | [26](../docs/design/platform-engineering.md#plan-26), [22](../docs/design/authoring-resources-wiring.md#plan-22) |
| Placeholders (`${resources..outputs}`, `${context.*}`) | Aspire-style lazy refs aligned to this syntax | ✅ | [22](../docs/design/authoring-resources-wiring.md#plan-22) |
| Score workload spec | HoBo IfC resources + WIT ports; **Score importable** (interop) | ✅➕ | [02](../docs/design/sdk-api.md#plan-02), [21](../docs/design/authoring-resources-wiring.md#plan-21) |
| Shared / active / implicit resources | Shared resources + ResourceActors + implicit scaffolding | ✅ | [04](../docs/design/control-plane.md#plan-04) |

### Environments & lifecycle
| Humanitec | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Applications / Environments / Environment Types | Bindle / **Camp** with **environment type** (matching dimension) | ✅ | [26](../docs/design/platform-engineering.md#plan-26) |
| Env cloning | Camp `clone-from` | ✅ | [26](../docs/design/platform-engineering.md#plan-26) |
| Ephemeral / dynamic (per-PR) environments | Ephemeral/preview Camps (auto-TTL) | ✅ | [26](../docs/design/platform-engineering.md#plan-26) |
| Workload Profiles | **Workload Profiles** (wasm-component/container/serverless/VM) | ✅ | [27](../docs/design/platform-engineering.md#plan-27) |
| Rollback / incremental deploys | Event-sourced rollback + incremental reconcile | ✅ | [26](../docs/design/platform-engineering.md#plan-26), [04](../docs/design/control-plane.md#plan-04) |

### Platform & operations
| Humanitec | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Portal (golden paths, catalogs, scorecards) | HoBo dashboard + resource-graph/matching/delta/pipeline views | ✅ | [07](../docs/design/developer-experience.md#plan-07) |
| Agent (private-network reverse tunnel) | **HoBo Relay** (outbound-only; Executors run behind it) | ✅ | [28](../docs/design/platform-engineering.md#plan-28), [12](../docs/design/security-networking.md#plan-12), [13](../docs/design/security-networking.md#plan-13) |
| Operator (secret provisioning) | Provider `secrets` port + brokered tokens | ✅ | [06](../docs/design/ai-native-agent-auth.md#plan-06), [12](../docs/design/security-networking.md#plan-12) |
| Pipelines (triggers + approval gates) | **Pipelines** atop sagas + policy gates | ✅ | [28](../docs/design/platform-engineering.md#plan-28), [05](../docs/design/reliability-observability-cost.md#plan-05) |
| GitOps mode (write CRs to Git) | **GitOps publisher** target | ✅ | [28](../docs/design/platform-engineering.md#plan-28), [22](../docs/design/authoring-resources-wiring.md#plan-22) |
| Resource Packs | **Resource Packs** in the Registry (Forge-generatable) | ➕ | [27](../docs/design/platform-engineering.md#plan-27), [06](../docs/design/ai-native-agent-auth.md#plan-06) |
| RBAC + approvals | ABAC + policy gates | ✅ | [12](../docs/design/security-networking.md#plan-12), [06](../docs/design/ai-native-agent-auth.md#plan-06) |
| Audit logs (365d, immutable) | Event log **is** the audit log (replayable) | ➕ | [11](../docs/design/event-model.md#plan-11), [14](../docs/design/reliability-observability-cost.md#plan-14) |
| Drift detection | Drift loop (heal/propose/ignore) | ✅ | [05](../docs/design/reliability-observability-cost.md#plan-05) |
| CI/CD integration | CLI/MCP + Pipelines + artifact triggers | ✅ | [15](../docs/design/developer-experience.md#plan-15), [28](../docs/design/platform-engineering.md#plan-28) |
| MCP (AI agents drive it) | `@hobo/mcp` (agents as first-class principals) | ➕ | [06](../docs/design/ai-native-agent-auth.md#plan-06) |
| Self-hosted + air-gapped | Self-host = hosted (the Yard is a Bindle) + Agent | ✅ | [04](../docs/design/control-plane.md#plan-04) |
| IDP "5-plane" framing | HoBo = Integration & Delivery plane orchestrator | ✅ | [00](../docs/design/vision.md#plan-00), [17](../docs/design/positioning.md#plan-17) |

### Where HoBo deliberately exceeds Humanitec
| Capability | HoBo doc |
|---|---|
| **Auditable matching** (`match.Decided` events — "why this infra", replayable) | [25](../docs/design/platform-engineering.md#plan-25), [11](../docs/design/event-model.md#plan-11) |
| **WASM-first polyglot runtime** (not K8s-centric) | [20](../docs/design/wasm-runtime-wit.md#plan-20) |
| **Event-sourced replay/time-travel + DR-as-replay** | [11](../docs/design/event-model.md#plan-11), [05](../docs/design/reliability-observability-cost.md#plan-05) |
| **Forge-generated Resource Definitions, Packs & implementations** (not human-only) | [23](../docs/design/forge-generated-stack.md#plan-23), [06](../docs/design/ai-native-agent-auth.md#plan-06) |
| **IfC-default simplicity** + mapping-as-sugar (lower learning curve) | [02](../docs/design/sdk-api.md#plan-02), [25](../docs/design/platform-engineering.md#plan-25) |
| **OSS core + WIT-standard ports** (less lock-in) | [17](../docs/design/positioning.md#plan-17), [24](../docs/design/wasm-runtime-wit.md#plan-24) |

### Open parity items (iteration hooks)
- Resource Definition authoring surface: TS (typed) vs YAML (Humanitec-parity) vs both.
- Whether `echo`/BYO resources participate in drift/reconcile or are read-only.
- Agent transport + multi-cluster routing details.
- Matching scoring exactly mirroring Humanitec vs a HoBo refinement (explicit priorities).
