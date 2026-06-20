# Humanitec — Editions, Positioning & Recent Direction

> Part of the [Humanitec competitor reference](./README.md).

## Editions & deployment models
- **SaaS (cloud-hosted):** fully managed, multi-tenant; uses the Agent for private-cluster access.
- **Self-hosted (GA Dec 2025):** entire Orchestrator on customer infra; data sovereignty, **air-gapped** support; regulated industries (banking/insurance/gov/defense), GovCloud/sovereign clouds.
- **Free / community:** free trial (no card); a free community version is mentioned (limits not fully public).
- **Pricing:** not publicly disclosed — demo/contact required (an adoption + comparison friction point).

## Positioning vs adjacent tools (Humanitec's framing)
- **vs Backstage** — complementary, not competitive. Backstage = developer **portal** (catalog/scaffolding, OSS framework); Humanitec = **backend orchestrator** (config generation, provisioning). "Deploy Humanitec first, layer Backstage on top." Humanitec argues Backstage is framework-heavy DIY.
- **vs Terraform / Pulumi** — Humanitec is the **orchestration layer above** IaC: it *orchestrates and standardizes* TF execution via drivers (declarative + policy-driven) rather than replacing it.
- **vs Crossplane** — Crossplane is a K8s-native control plane (CRDs); Humanitec is broader app+infra orchestration not requiring K8s-CRD modeling of everything.
- **vs ArgoCD / Flux** — GitOps operators sync Git→cluster; Humanitec **generates** what to sync (and adds multi-stage workflows, approvals, policy) then can hand off to Argo/Flux.
- **vs Qovery / Northflank / Nitric** — those are simpler PaaS/serverless-first; Humanitec is enterprise-grade orchestration with deep policy/governance and a single app+infra graph (more upfront config, more control).

## Stated strengths
Dynamic resource graph; true developer self-service (intent → platform applies rules); policy/governance (RBAC, approvals, drift, audit); multi-env/multi-cloud/multi-cluster; production-ready (SaaS + self-hosted); IaC-agnostic (TF/Pulumi/CFN/custom drivers); proven in regulated/air-gapped enterprises.

## Gaps / criticism (competitor openings)
- Steep learning curve; many interlocking concepts (Resource Types/Definitions/Drivers/Runners/Manifests); docs lag features.
- Kubernetes-centric; limited native serverless; assumes containerized workloads.
- Opaque pricing; proprietary core (vs OSS Backstage).
- Not a full observability platform.
- Vendor lock-in risk (Humanitec Manifests), though Score is open.
- Audit limits (no request bodies/IPs, ~5-min delay); opaque matching selection.

## Recent direction (2024–2026)
- **Sept 2025:** Orchestrator **v2** — compute-agnostic, simplified, AI-first.
- **Dec 2025:** self-hosted Orchestrator GA (regulated/sovereign unlock).
- **Jan 2026:** **MCP** integration — AI agents (Claude/ChatGPT) drive the Orchestrator.
- **Aug 2025:** Container Driver. **2026:** **incremental deployments** (update only changed resources); plan-only & historical resource graphs.
- Strategic shift: "K8s orchestrator" → "any-compute orchestrator"; "DevOps tool" → "AI-integrated developer platform".

## What this means for HoBo
Humanitec is mature, enterprise-grade, and now explicitly **AI-first** — so HoBo can't win on "AI-native" alone. HoBo must combine Humanitec's best engine (Resource Definitions + Matching, drivers, sets/deltas, governance) with what Humanitec lacks: a **wasm-first polyglot runtime**, **event-sourced replay/time-travel + auditable matching decisions**, **Forge-generated definitions/implementations**, **IfC-default simplicity**, and an **OSS core**. See [hobo-mapping.md](./hobo-mapping.md).
