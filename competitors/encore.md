# Encore — competitor reference

> A faithful capture of **Encore** for HoBo competitive analysis. Encore is the **closest product analog** to HoBo: **infrastructure-from-code** for TypeScript/Go where you declare cloud resources in your app code, run locally against real infra, and deploy to your own AWS/GCP. Source: [encore.dev](https://encore.dev/) · [github.com/encoredev/encore](https://github.com/encoredev/encore) · [encore.cloud](https://encore.cloud/). License **MPL-2.0** (framework/CLI/self-host OSS; Encore Cloud commercial). Excerpts quoted for analysis (see [`../README.md`](README.md#sources--fair-use)).

## What it is

Encore is an **open-source infrastructure SDK** (MPL-2.0) for **TypeScript (`Encore.ts`) and Go (`Encore.go`)** — *"the infrastructure platform for the intelligence era, where engineers and AI agents build production systems without waiting on infrastructure."* You **declare resources directly in code** (databases, pub/sub, object storage, caches, cron, secrets, APIs); `encore run` starts the whole system locally with **real Postgres, real pub/sub semantics, distributed tracing, and a dev dashboard at `localhost:9400`**; then you deploy to **your own AWS or GCP account** — self-hosted (`encore build docker` plus your own IaC) or via the optional managed **Encore Cloud**.

The mental model is **infrastructure-from-code (IfC)**: instead of a separate IaC file, you declare what the app needs **in the same files where you use it**. The Encore compiler parses those declarations to build an **application graph**, then provisions matching **production-grade managed services** in your cloud. This is the same IfC thesis HoBo adopts ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) — declare-and-the-platform-provisions — applied to TS/Go on AWS/GCP.

| Dimension | Encore |
|---|---|
| Authoring | **Infrastructure-from-code** in TS/Go (Python "coming soon") |
| Resources | databases (SQL+migrations), pub/sub, object storage (versioned buckets), caches (Redis), cron, secrets, type-safe APIs/services |
| Local dev | `encore run` → real Postgres + real pub/sub + tracing + **dashboard `:9400`** + infra "namespaces" |
| Clouds | **your own AWS or GCP** (managed services) |
| Deploy | OSS self-host (`encore build docker` + Terraform/etc.) **or** Encore Cloud (provisions in your account, per-PR preview envs, least-priv IAM, tracing, cost) |
| AI | **MCP server** so agents introspect the app graph (services/APIs/DBs/traces); generates AI-tool rules files |
| License | **MPL-2.0** (OSS core); Encore Cloud commercial |

## Feature surface

### Infrastructure-from-code — the IfC loop

1. **Declare** resources as objects in your TS/Go code, in the same files that use them — a SQL database, a pub/sub topic, a bucket, a cache, a cron job, a secret, an API/service.
2. **Compile/parse.** Encore's compiler statically analyzes the declarations to build an **application graph** (services, APIs, and the infra each needs) — no separate IaC file.
3. **Provision.** Encore maps each declared resource to a **production-grade managed service** in your AWS or GCP account and wires connection settings plus IAM automatically.

The declarable catalog and where each resource lands:

| Resource | Encore declares | Provisioned to (AWS / GCP) |
|---|---|---|
| **SQL database** | `new SQLDatabase(...)` + migrations | RDS / Cloud SQL (Postgres) |
| **Pub/Sub** | topics + subscriptions with delivery guarantees | SNS+SQS / Pub/Sub |
| **Object storage** | versioned buckets | S3 / GCS |
| **Caching** | Redis-compatible keyspaces | ElastiCache / Memorystore |
| **Cron** | scheduled jobs | platform scheduler |
| **Secrets** | secret values referenced in code | Secrets Manager / Secret Manager |
| **APIs / services** | type-safe service-to-service calls | service mesh / IAM wiring |

This is **exactly HoBo's IfC stance** ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21) resource catalog + wiring/manifest): declare resources inline, let the platform collect them into a graph and provision them, with connection info injected (never hand-wired). Encore validates the model in production at scale.

### Local development loop

- **`encore run`** starts the whole system locally with **real Postgres, real pub/sub semantics, and distributed tracing** — not mocks. This is high-fidelity local dev: the same resource declarations that provision in prod run against real local equivalents.
- **Dev dashboard at `localhost:9400`** — real-time service list, **distributed traces**, database browser, and **auto-generated architecture diagrams** of the app graph.
- **Infrastructure "namespaces"** — isolated infra state per branch, so parallel work does not collide.

### Deployment paths

- **Self-host (OSS, MPL-2.0):** `encore build docker` produces a **standalone Docker image**; you provision the infra and run it (Terraform/your own tooling). The framework, CLI, and self-host are open source.
- **Encore Cloud (commercial):** the managed platform provisions resources **in your own AWS/GCP account**, manages **per-PR preview environments** for end-to-end testing, handles **least-privilege IAM**, and provides distributed tracing plus **cost analytics**. Persistent environments (staging/prod) are provisioned into your account.

### AI / agent surface

- **MCP server** that lets AI agents **introspect the application graph** — services, APIs, databases, traces — so agents can reason about and validate changes.
- `encore app create` can **generate AI-tool rules files** (Cursor, Claude Code, …) and wire the MCP server.
- Positioned explicitly for **AI-assisted development**: the fast local→cloud loop lets agents validate against real infra immediately.

## Differentiators

### Strengths (what Encore does well)

- **Real infrastructure-from-code, shipping in production.** Declare resources in TS/Go; Encore builds the app graph and provisions managed services — the IfC thesis HoBo bets on, validated at scale.
- **Excellent local DX.** `encore run` with **real Postgres + real pub/sub + tracing + a dashboard (`:9400`)** and per-branch infra namespaces — the gold standard for "works locally predicts works in prod."
- **Type-safe service-to-service APIs** with generated clients — strong end-to-end typing.
- **Deploys into *your* AWS/GCP account** with least-privilege IAM plus per-PR preview environments (Encore Cloud).
- **AI-native posture:** MCP server for agent introspection, AI-tool rules generation, fast local→cloud validation loop.
- **OSS core (MPL-2.0)** with a clean OSS/commercial split.

### Gaps (Encore's limits — HoBo's opening)

- **AWS/GCP only; Encore owns provisioning.** No Azure/Cloudflare/edge/on-prem, and **no pluggable IaC** — you cannot bring Pulumi/Crossplane/Terraform or pin specific boundaries to specific providers. HoBo is genuinely **multi-cloud + IaC-agnostic** with typed provider-native escape hatches ([Plan 4](../docs/design/control-plane.md#plan-04)).
- **TS/Go only** (Python pending) — language-bound, like Convex/Lakebed. HoBo's runtime contract is **language-neutral WIT** (any wasm-compiling language, [Plan 20](../docs/design/wasm-runtime-wit.md#plan-20)).
- **No platform-rules layer.** Fixed resource→service mapping, tied to Encore's SDK/compiler with less of an escape hatch to provider-native primitives than HoBo's typed `.with(...)`. HoBo adds **Resource Definitions + Matching** so the *same* app realizes different infra per environment — cheap preview vs managed-HA prod — auditably ([Plan 25](../docs/design/platform-engineering.md#plan-25)/[ADR-0033](../docs/design/adr/05-config-matching-environments.md#adr-0033)).
- **No event-sourced control plane / audit-replay**, no **contracts/`can-deploy`/policy** planes, no **cost** plane beyond Encore Cloud analytics.
- **No cross-cloud data story** (migration/portability/consistency) — HoBo specifies app-data migration ([ADR-0032](../docs/design/adr/03-data-plane.md#adr-0032)) plus cross-Camp consistency ([ADR-0040](../docs/design/adr/05-config-matching-environments.md#adr-0040)).
- **No AI-generated providers** (Forge), no **agents-as-principals**, no **trainable semantic functions**.
- **Full value leans on Encore Cloud, and framework lock-in.** OSS self-host generates a Docker image but leaves provisioning to you; the managed platform is where preview envs/IAM/cost live, and migrating off the SDK is a rewrite. HoBo's `hobo import` adopts existing estates in place ([ADR-0041](../docs/design/adr/07-portability-extensibility.md#adr-0041)).

### Comparisons

- **vs HoBo:** Encore is **IfC → AWS/GCP, TS/Go, opinionated, great DX**; HoBo is **IfC → any cloud via pluggable adapters, any wasm language, event-sourced + AI-native + governed**. Encore is the sharpest validation that HoBo's *authoring model* is right and the clearest reminder that HoBo's edge is **breadth (clouds/languages/IaC) + the control-plane planes + AI-native depth**. On local fidelity specifically, Encore's "real Postgres + real pub/sub locally" is the bar HoBo's `hobo dev` targets — HoBo formalizes it as a **fidelity matrix** (simulate/mock/Camp-only) with **`hobo verify` splitting local vs Camp checks** so "works locally" is an honest, bounded promise ([ADR-0042](../docs/design/adr/07-portability-extensibility.md#adr-0042)). On self-host, Encore's OSS-core leaves provisioning to you, whereas HoBo's **Yard is itself a Bindle** (self-host = hosted parity, [Plan 4](../docs/design/control-plane.md#plan-04)); HoBo ships no billing, commercialization is out of design scope ([ADR-0064](../docs/design/adr/08-scope-and-requirements.md#adr-0064)), and its metering/quota/showback is OSS FinOps ([ADR-0039](../docs/design/adr/04-governance-verification.md#adr-0039)).
- **vs Nitric:** both are cloud-agnostic-ish IfC; Nitric is more multi-cloud + language-broad via its own runtime, Encore is more opinionated/managed with superior local DX.
- **vs Aspire:** Aspire composes/orchestrates for local-dev + deploy but does not *own* cloud provisioning; Encore provisions managed services directly.
- **vs SST/Pulumi/Terraform:** Encore positions against these as "IfC, not IaC" — no separate config files; HoBo agrees but keeps IaC tools as **pluggable adapters under** the IfC layer (best of both).
- **vs Convex/Supabase:** those are managed backends; Encore deploys into *your* cloud account (no vendor-runtime lock-in), closer to HoBo's stance.

**Net:** Encore is HoBo's closest product-shaped competitor on **authoring + DX**, and the gap is **everything HoBo adds around the IfC core**: true multi-cloud + pluggable IaC, a language-neutral wasm runtime, Resource Definitions/Matching, event-sourced governance (cost/policy/contracts), cross-cloud data, and AI-native depth (Forge, agents-as-principals, trainable functions).

## HoBo mapping

> HoBo's equivalent for each Encore concept (✅ has · ➕ goes further · 🔜 planned).

| Encore concept | HoBo equivalent | Notes |
|---|---|---|
| **Infrastructure-from-code** (declare resources in app code) | **IfC authoring** ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) | ✅ same thesis — declare inline, platform collects + provisions |
| Declared resources (DB / pub-sub / object-storage / cache / cron / secrets / APIs) | the HoBo resource catalog (`sql`/`topic`/`bucket`/`kv`/`schedule`/`secret`/`service`) ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) | ✅ near 1:1 |
| Type-safe service-to-service APIs + generated clients | typed `ctx.bindings` + WIT-generated clients ([ADR-0037](../docs/design/adr/05-config-matching-environments.md#adr-0037)) | ✅ HoBo generates from WIT+Zod+`.allow()`+graph |
| Provisions to **your AWS/GCP** (managed services) | provider adapters across **many clouds** + pluggable IaC ([Plan 4](../docs/design/control-plane.md#plan-04)) | ➕ multi-cloud + Pulumi/Crossplane/TF/OpenTofu as adapters + per-tier mapping |
| Fixed resource→service mapping | **Resource Definitions + Matching** ([Plan 25](../docs/design/platform-engineering.md#plan-25)/[ADR-0033](../docs/design/adr/05-config-matching-environments.md#adr-0033)) | ➕ same app → different infra per env, auditable (`match.Decided`) |
| `encore run` (real Postgres + pub/sub locally) | `hobo dev` on `runtime-local` + **fidelity matrix** ([Plan 7](../docs/design/developer-experience.md#plan-07)/[ADR-0042](../docs/design/adr/07-portability-extensibility.md#adr-0042)) | ✅/➕ HoBo labels simulate/mock/Camp-only + `hobo verify` splits local vs Camp |
| Dev dashboard `:9400` (traces, DB, arch diagram) | dashboard ([Plan 7](../docs/design/developer-experience.md#plan-07)) + observability ([Plan 5](../docs/design/reliability-observability-cost.md#plan-05)) + topology graph | ✅ |
| Infra **namespaces** / per-PR **preview environments** | **ephemeral/preview Camps + Deltas→Sets** ([Plan 25](../docs/design/platform-engineering.md#plan-25)) | ✅ |
| Self-host (`encore build docker`) vs **Encore Cloud** | self-hostable **Yard-is-a-Bindle** ([Plan 4](../docs/design/control-plane.md#plan-04)); HoBo is OSS, commercialization out of design scope ([ADR-0064](../docs/design/adr/08-scope-and-requirements.md#adr-0064)) | ➕ self-host = hosted parity; metering/showback is OSS FinOps, no billing ([ADR-0039](../docs/design/adr/04-governance-verification.md#adr-0039)) |
| Least-privilege IAM (Encore Cloud) | `.allow()` → least-priv IAM + wasm link + token (one decl, three effects) ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) | ✅/➕ |
| **MCP server** for agent introspection | `@hobo/mcp` control surface ([Plan 6](../docs/design/ai-native-agent-auth.md#plan-06)) | ✅/➕ agents are first-class principals with brokered tokens + audit |
| TS/Go (Python coming) | language-neutral **WIT** runtime, any wasm language ([Plan 20](../docs/design/wasm-runtime-wit.md#plan-20)) | ➕ |
| *(none — greenfield-leaning)* | **`hobo import`** adopt-in-place migration ([ADR-0041](../docs/design/adr/07-portability-extensibility.md#adr-0041)) | ➕ adopt existing TF/Pulumi/Lakebed/FaaS estates incrementally |
| *(none)* | **Event-sourced control plane + audit/replay** ([Plan 11](../docs/design/event-model.md#plan-11)) | ➕ |
| *(none)* | **Contracts/`can-deploy` + policy planes** ([Plan 29](../docs/design/contracts-policy-flags.md#plan-29)) | ➕ |
| *(none)* | **Forge** — AI-generated providers/impls ([Plan 23](../docs/design/forge-generated-stack.md#plan-23)) + **trainable semantic functions** ([Plan 23](../docs/design/forge-generated-stack.md#plan-23)) | ➕ |
| *(none)* | **Cross-cloud data**: app-data migration ([ADR-0032](../docs/design/adr/03-data-plane.md#adr-0032)) + cross-Camp consistency ([ADR-0040](../docs/design/adr/05-config-matching-environments.md#adr-0040)) | ➕ |

### The one-line takeaway

**Encore proves HoBo's IfC authoring model + local DX in production** — and maps cleanly onto Plans 21/22/15/26 — but is bounded to **AWS/GCP + TS/Go + fixed mapping + a deploy pipeline**. HoBo's differentiation is the surrounding system: **any-cloud + pluggable-IaC breadth, a language-neutral wasm runtime, Resource Definitions/Matching, event-sourced governance (cost/policy/contracts), cross-cloud data, and AI-native depth (Forge, agents-as-principals).**
