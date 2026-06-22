# Encore — competitor reference

> A faithful capture of **Encore** for HoBo competitive analysis. Encore is the **closest product analog** to HoBo: **infrastructure-from-code** for TypeScript/Go where you declare cloud resources in your app code, run locally against real infra, and deploy to your own AWS/GCP. Source: [encore.dev](https://encore.dev/) · [github.com/encoredev/encore](https://github.com/encoredev/encore) · [encore.cloud](https://encore.cloud/). License **MPL-2.0** (framework/CLI/self-host OSS; Encore Cloud commercial). Excerpts quoted for analysis (see [`../README.md`](../README.md#sources--fair-use)).

## What it is
Encore is an **open-source infrastructure SDK** (MPL-2.0) for **TypeScript (`Encore.ts`) and Go (`Encore.go`)** — *"the infrastructure platform for the intelligence era, where engineers and AI agents build production systems without waiting on infrastructure."* You **declare resources directly in code** (databases, pub/sub, object storage, caches, cron, secrets, APIs); `encore run` starts the whole system locally with **real Postgres, real pub/sub semantics, distributed tracing, and a dev dashboard at `localhost:9400`**; then you deploy to **your own AWS or GCP account** — self-hosted (`encore build docker` + your own IaC) or via the optional managed **Encore Cloud**.

## The mental model — infrastructure-from-code (IfC)
Instead of a separate IaC file, you declare what the app needs **in the same files where you use it**. The Encore compiler parses these declarations to build an **application graph**, then provisions matching **production-grade managed services** in your cloud. This is the same IfC thesis HoBo adopts ([Plan 21](../../docs/design/21-resources-catalog.md)/[Plan 22](../../docs/design/22-wiring-manifest.md)) — declare-and-the-platform-provisions — applied to TS/Go on AWS/GCP.

## At a glance
| Dimension | Encore |
|---|---|
| Authoring | **Infrastructure-from-code** in TS/Go (Python "coming soon") |
| Resources | databases (SQL+migrations), pub/sub, object storage (versioned buckets), caches (Redis), cron, secrets, type-safe APIs/services |
| Local dev | `encore run` → real Postgres + real pub/sub + tracing + **dashboard `:9400`** + infra "namespaces" |
| Clouds | **your own AWS or GCP** (managed services) |
| Deploy | OSS self-host (`encore build docker` + Terraform/etc.) **or** Encore Cloud (provisions in your account, per-PR preview envs, least-priv IAM, tracing, cost) |
| AI | **MCP server** so agents introspect the app graph (services/APIs/DBs/traces); generates AI-tool rules files |
| License | **MPL-2.0** (OSS core); Encore Cloud commercial |

## Known gaps (a competitor/HoBo could exploit)
- **AWS/GCP only — not truly any-cloud.** Encore provisions to AWS or GCP; no Azure/Cloudflare/edge/on-prem breadth, and no pluggable-IaC story (it owns provisioning).
- **TS/Go only** (Python pending) — language-bound, like Convex/Lakebed.
- **Opinionated, framework-coupled.** IfC is tied to Encore's SDK + compiler; less of an escape hatch to provider-native primitives than HoBo's typed `.with(...)`.
- **Full value leans on Encore Cloud.** OSS self-host generates a Docker image but leaves provisioning to you; the managed platform is where preview envs/IAM/cost live.
- **No wasm/polyglot runtime, no event-sourced control plane, no Forge/agents-as-principals, no contracts/policy/matching planes** — Encore is a great IfC deploy pipeline, not an AI-native multi-cloud control plane.

## Files
- [`infrastructure-from-code.md`](./infrastructure-from-code.md) — the IfC model + declarable resources.
- [`local-dev-deploy.md`](./local-dev-deploy.md) — `encore run`, dashboard, preview envs, self-host vs Encore Cloud, MCP/AI.
- [`differentiators.md`](./differentiators.md) — strengths, gaps, comparisons.
- [`hobo-mapping.md`](./hobo-mapping.md) — Encore ↔ HoBo.
