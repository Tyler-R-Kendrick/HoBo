# Humanitec — Platform, Operations & Governance

> Part of the [Humanitec competitor reference](./README.md). Portal, Agent, CI/CD, RBAC, secrets, observability, extensibility.

## Portal / developer self-service
Web UI atop the Orchestrator: self-service environments/deployments, app status, resource-graph visualization, drift detection. Platform engineers do resource management/setup here. Features: **golden paths / paved roads** (platform rules developers follow declaratively via Score), service catalogs, dashboards, self-service templates/scaffolding, **scorecards** (health/compliance, DORA metrics), RBAC, automated docs/audit. The Portal is **optional/modular** — teams can use API/CLI or other portals (Backstage, Port.io) instead. Humanitec frames Portal vs Orchestrator as a clean separation: the Orchestrator is the engine; the portal is one surface.

## The Humanitec Agent
A lightweight proxy inside the customer's private network so the **SaaS** Orchestrator can deploy into **private/air-gapped** clusters **without inbound access**:
- **Reverse tunnel:** Agent makes an **outbound TCP 443** connection to Humanitec; no open ports/exposed endpoints.
- TLS-encrypted, authenticated; credentials stay in-network; the Orchestrator never connects directly to private clusters — all proxying goes through the Agent.
- Installed as a K8s agent; one Agent can manage multiple clusters; used for private K8s, multi-region/multi-cloud, regulated/air-gapped environments. Also enables a GitOps mode where the Agent pulls runtime data.

## Humanitec Operator
Separate from the Agent; a K8s operator on each cluster (public or private) managing CRDs and provisioning **Secrets** from secret stores (Vault, Azure Key Vault, Infisical, native K8s). Helm-installed controller-manager acts on resource changes.

## CI/CD & Pipelines
- Works with **any** CI (GitHub Actions, GitLab, Bitbucket, CircleCI, Jenkins, Codefresh). Pattern: CI builds image → notifies Orchestrator of new artifact → Orchestrator deploys (via `humctl score deploy --image <ver>` or webhook, using a service-user token).
- **Humanitec Pipelines** (feature): multi-step deployment workflows. Triggers: **Deployment Request** (new artifacts matching criteria) and **API**. **Deployment rules** are if-then (e.g. "new image from dev HEAD → deploy dev-testing"); flexible image matching/exclusion. Jobs run in parallel with `needs` for ordering; max ~10 concurrent runs; custom `concurrency` locks. Integrate policy checks, sign-offs, Slack/Teams notifications.
- **GitOps mode:** Orchestrator writes the Resource Graph as K8s Custom Resources to a Git repo/branch; ArgoCD/Flux sync to clusters. Can run standalone or hybrid.

## Deployment targets
Kubernetes-centric (EKS/GKE/AKS/on-prem/private). Cloud resources via **Terraform driver** (any TF provider), **Template driver** (K8s), **Container driver** (Pulumi/CFN/custom). v2 extends to "any compute" (VMs/serverless) but K8s remains primary; native serverless (Cloud Run/Lambda as primary compute) is limited.

## RBAC, governance, approvals
- **RBAC** (GA 2025) at **Organization / Application / Environment-Type** levels; least-privilege default; roles like admin/developer/ops/delivery-manager/approver/viewer.
- **Approvals/sign-offs** via Pipelines + webhooks (e.g. notify Slack pre-prod, delivery manager confirms prod). Policy checks run automatically pre-deploy. Standardization by design (devs declare *what*, platform enforces *how*).

## Secrets management
Secrets are a resource type whose outputs inject into containers at runtime; never logged or persisted in manifests/Git. Stores: **Vault** (KV v2, dynamic creds), **Azure Key Vault**, **Infisical**, **native K8s**. Shared values/secrets scoped to app/environment with overrides.

## Observability, status, audit
- Deployment status tab (active deployment + workloads + shared resources); resource-status health via the Operator; plan-only & historical resource graphs (2026).
- **Drift detection** (TF provider): desired (graph) vs actual; alerts on config drift.
- Scorecards + DORA metrics; integrates external monitoring (Prometheus/Datadog) via resource definitions. Not a full observability platform.
- **Audit log:** every API change on every entity, who/when/action; min **365-day** retention, immutable; **no request bodies / no IPs**; up to ~5-min delay.

## Extensibility & API
- **Drivers** = the core extension (HTTP PUT/DELETE implementing the driver interface; any stack; embed TF/Pulumi/CFN/custom). **Resource Packs** bundle definitions; open-source driver library.
- REST API for all entities; **webhooks** (env create/delete, deploy start/complete; customizable payloads with variable substitution); Terraform provider; **MCP** support (Jan 2026) so AI agents drive the Orchestrator.
