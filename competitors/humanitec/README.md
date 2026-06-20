# Humanitec — Competitor Reference

> Captured for HoBo competitive analysis (research as of 2026). This folder documents **Humanitec's Platform Orchestrator** faithfully; the HoBo↔Humanitec parity tracker is in [`hobo-mapping.md`](./hobo-mapping.md).
>
> Files: [orchestration-model.md](./orchestration-model.md) · [drivers.md](./drivers.md) · [platform-ops.md](./platform-ops.md) · [pricing-positioning.md](./pricing-positioning.md) · [differentiators.md](./differentiators.md) · [hobo-mapping.md](./hobo-mapping.md)

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
- **Resource Definitions + Matching Criteria** (specificity scoring) — the platform-config layer — see [orchestration-model.md](./orchestration-model.md).
- **Resource Graph** (DAG of implicit + dependent + co-provisioned resources) — see [orchestration-model.md](./orchestration-model.md).
- **Drivers** (terraform / template / echo / container / custom-webhook) + **Resource Packs** + **Workload Profiles** — see [drivers.md](./drivers.md).
- **Score** workload spec; **Applications / Environments / Environment Types**; **Deployment Sets** (immutable) + **Deltas** (mutable diff); cloning + ephemeral environments — see [orchestration-model.md](./orchestration-model.md).
- **Portal**, **Agent** (private-network deploys), **Operator**, **Pipelines**, **GitOps**, **RBAC + approvals**, **secrets**, **audit logs** — see [platform-ops.md](./platform-ops.md).
- **Pricing/editions** (SaaS + self-hosted + air-gapped), positioning, 2024–26 direction (MCP, self-hosted GA, incremental deploys) — see [pricing-positioning.md](./pricing-positioning.md).

## Known gaps (opportunities for HoBo)
- Kubernetes-centric; weak native serverless (no first-class Cloud Run/Lambda compute).
- Steep learning curve; opaque pricing; proprietary core.
- Not a full observability platform; relies on external tools.
- Opaque matching selection (no first-class "why this infra" audit).
- No wasm/polyglot-component runtime; no event-sourced replay/time-travel.

See [differentiators.md](./differentiators.md) for the full strengths/gaps and [hobo-mapping.md](./hobo-mapping.md) for HoBo's response.
