# Humanitec — Drivers, Resource Packs & Workload Profiles

> Part of the [Humanitec competitor reference](./README.md). The execution layer that actually provisions resources.

## Drivers (the execution mechanism)
A **Driver** provisions a resource given a Resource Definition's inputs + context, and returns outputs (and optionally K8s manifests).

| Driver | `driver_type` | What it does |
|---|---|---|
| **Terraform** | `humanitec/terraform` | Runs Terraform/OpenTofu (inline `tf_code` or Git module); manages state; any TF provider. GA. |
| **Template** | `humanitec/template` | Renders Go templates → Kubernetes manifests (Namespace, Service, Ingress, CRDs, quotas…). |
| **Echo** | `humanitec/echo` | Passes inputs through as outputs unchanged — for **externally-managed** resources Humanitec reads but doesn't provision. |
| **Container** | `humanitec/container` | Runs a K8s Job for complex/custom provisioning (Pulumi, CloudFormation, scripts); a sidecar `outputs-fetcher` reads the outputs JSON. |
| **Custom (webhook)** | `custom/<name>` | Calls a self-hosted HTTP service (signed JWT payload); returns outputs JSON + optional manifests. Any tech stack. |

### Driver interface (conceptual)
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

## Resource Packs
Pre-built collections of Resource Definitions for common use cases (AWS, GCP, Azure, in-cluster). Typically use the Terraform or Template driver. Imported into an org and customized via matching criteria. Marketplace at humanitec.com/marketplace. Used to jump-start platform setup.

## Workload Profiles
A template for **how a workload is realized** (e.g. Kubernetes Deployment vs serverless vs batch job). Built-in `container` (default K8s); custom profiles defined via a spec + Helm chart. Selected when generating the Deployment Set; influences the produced manifests. Enables Dapr services, gRPC servers, batch jobs, etc.

## Notable
- Co-provisioning: one Resource Definition can create several resources + the edges between them.
- The Container/Custom drivers are how Humanitec stays IaC-agnostic (Terraform, Pulumi, CloudFormation, or anything HTTP-callable).
