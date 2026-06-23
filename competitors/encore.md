# Encore — competitor reference

> A faithful, detailed capture of **Encore** for HoBo competitive analysis. Encore is the **closest product analog** to HoBo: **infrastructure-from-code** for TypeScript/Go where you declare cloud resources in your app code, run locally against real infra, and deploy to your own AWS/GCP. Sources: [encore.dev](https://encore.dev/) · [encore.dev/docs](https://encore.dev/docs) · [github.com/encoredev/encore](https://github.com/encoredev/encore) · [encore.cloud](https://encore.cloud/) · [encore.dev/pricing](https://encore.dev/pricing). License **MPL-2.0** (framework/CLI/self-host OSS; Encore Cloud commercial). Researched June 2026; API/CLI/pricing shapes quoted for analysis under fair use (see [`../README.md`](README.md#sources--fair-use)).

## What it is

Encore is an **open-source backend framework + infrastructure SDK** (MPL-2.0) for **TypeScript (`Encore.ts`) and Go (`Encore.go`)** — positioned as *"the infrastructure platform for the intelligence era, where engineers and AI agents build production systems without waiting on infrastructure."* You **declare resources directly in code** (SQL databases, Pub/Sub, object storage, caches, cron, secrets, and type-safe APIs/services); **`encore run`** boots the whole system locally against **real Postgres, a real local Pub/Sub broker, real local object storage, distributed tracing, and a dev dashboard at `localhost:9400`**; then you deploy to **your own AWS or GCP account** — self-hosted (`encore build docker` + your own IaC) or via the optional managed **Encore Cloud**.

The mental model is **infrastructure-from-code (IfC)**: instead of a separate IaC file, you declare what the app needs **in the same files where you use it**. Encore's compiler **statically parses** those declarations to build an **application graph** (services, APIs, and the infra each needs), then provisions matching **production-grade managed services** and wires connection settings + IAM automatically. Encore positions this explicitly against IaC ("IfC, not IaC") and against managed-runtime BaaS (it deploys into *your* cloud, no vendor runtime). This is the same IfC thesis HoBo adopts ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) — declare-and-the-platform-provisions — applied to TS/Go on AWS/GCP, and Encore validates it in production at scale.

**Performance angle (Encore.ts):** Encore.ts ships a **multithreaded Rust-based runtime** (built on Tokio/hyper) that handles request routing, schema parsing, and validation at the boundary before handing typed objects to your Node/TS handler — Encore reports large throughput gains vs. a plain Express/Node stack. The infra declarations are parsed by Encore's compiler, not executed, so the "application graph" is a static artifact.

| Dimension | Encore |
|---|---|
| Authoring | **Infrastructure-from-code** in TS/Go (Python "coming soon") |
| Resources | SQL DB (Postgres + migrations), Pub/Sub, object storage (versioned buckets), caches (Redis), cron, secrets, type-safe APIs/services, **streaming/WebSocket APIs** |
| API model | `api({method,path,expose,auth}, handler)`; type-safe by **source parsing**; `Header<>`/`Query<>` field encodings; `api.raw()`; `api.streamIn/streamOut/streamInOut` |
| Runtime | **Rust-based** request runtime (Encore.ts) + your TS/Go handlers |
| Local dev | `encore run` → real Postgres + local Pub/Sub broker + local object storage + tracing + **dashboard `:9400`** + per-branch infra **namespaces** + preview **DB branching** |
| Clouds | **your own AWS or GCP** (managed services); also **Neon** for Postgres |
| Deploy | OSS self-host (`encore build docker` + your IaC) **or** Encore Cloud (provisions in your account; per-PR preview envs; least-priv IAM; tracing; cost analytics) |
| AI | **MCP server** (agents introspect the app graph); generates AI-tool rules files (Cursor/Claude Code/…) |
| License / price | **MPL-2.0** OSS core; Encore Cloud Free / **Pro from $49/member/mo + $99/env/mo + $2.5/resource/mo** / Enterprise |

## Feature surface

### Infrastructure-from-code — the IfC loop

1. **Declare** resources as objects in your TS/Go code, in the same files that use them — a SQL database, a Pub/Sub topic, a bucket, a cache, a cron job, a secret, an API/service.
2. **Compile/parse.** Encore's compiler statically analyzes the declarations to build an **application graph** — no separate IaC file, no runtime reflection.
3. **Provision.** Encore maps each declared resource to a **production-grade managed service** in your AWS or GCP account and wires connection settings + IAM automatically.

### Resource primitives (the declarable catalog), with code shapes

- **SQL database** — `const db = new SQLDatabase("todo", { migrations: "./migrations" })`. **PostgreSQL only** (Neon, listed below, is *managed Postgres* — not a second engine). **Raw SQL, no ORM**: tagged-template `db.query` (async iterator), `db.queryRow` (row|null), `db.queryAll` (array), `db.exec` for writes, `db.rawQuery*` for parameterized raw, transactions via `await using tx = await db.begin()` + `tx.commit()`. **Migrations** are up-only SQL files in `migrations/` (`1_create_table.up.sql`, sequential; *down migrations are manual*). CLI: `encore db shell|conn-uri|proxy`. No built-in sharding or read-replica abstraction.
- **Pub/Sub** — typed topics + subscriptions with delivery guarantees (at-least-once), declared in code; maps to SNS+SQS (AWS) / Pub/Sub (GCP).
- **Object storage** — versioned **buckets**; S3 (+ CloudFront) / GCS (+ Cloud CDN).
- **Caching** — Redis-compatible keyspaces; ElastiCache / Memorystore.
- **Cron jobs** — scheduled functions declared in code.
- **Secrets** — `secret("MyKey")` referenced in code, resolved per-environment from Secrets Manager / Secret Manager; redacted from traces.

### APIs, services & streaming

- **APIs are plain typed functions:** `export const ping = api({ method: "POST", path: "/ping", expose: true }, async (p: Params): Promise<Resp> => {…})`. Encore **parses the source** to derive the request/response schema and **validates at the boundary automatically**. Field encodings: `Header<"Accept-Language">`, `Query<number>`, body-by-default; path params `:id` / wildcard `*path`.
- **Visibility & auth:** APIs are **private by default**; `expose: true` publishes; `auth: true` routes through a declared **auth handler** first. `sensitive: true` redacts payloads + excludes headers from traces. Custom status via an `HttpStatus` field.
- **Raw endpoints:** `api.raw(...)` for webhooks / low-level HTTP.
- **Streaming / WebSocket APIs:** three typed stream kinds — **`api.streamIn<Handshake,In,Out>`** (client→server, e.g. uploads), **`api.streamOut<Handshake,Out>`** (server→client, e.g. log streaming), **`api.streamInOut<Handshake,In,Out>`** (bidirectional, e.g. chat). The connection is established by an HTTP handshake that upgrades to a WebSocket; clients use generated clients (`for await (const msg of stream) {}` / `await stream.send({...})`).
- **Service-to-service calls are normal function calls** — Encore handles serialization, routing, and validation at the boundary; **generated typed clients** give end-to-end typing. A service is a directory with `encore.service.ts`.

### Local development loop

- **`encore run`** starts the whole system locally with **real Postgres (Docker), a real local Pub/Sub broker, real local object storage, and distributed tracing** — not mocks. The same declarations that provision in prod run against real local equivalents (high-fidelity dev).
- **Dev dashboard at `localhost:9400`** — real-time service list, **distributed traces**, an API explorer, a database browser, and **auto-generated architecture diagrams** of the app graph.
- **Infrastructure "namespaces"** — isolated infra state per branch; **preview environments** can do **database branching** from a seed environment for end-to-end PR testing.

### Deployment & Encore Cloud

- **Self-host (OSS, MPL-2.0):** `encore build docker` produces a **standalone Docker image**; you provision the infra and run it (Terraform/your own tooling). Framework + CLI + self-host are open source. The OSS image is explicitly the **migrate-away** path.
- **Encore Cloud (commercial):** provisions resources **in your own AWS/GCP account**, manages **per-PR preview environments**, handles **least-privilege IAM**, and provides distributed tracing + **cost analytics**. Persistent envs (staging/prod) provision into your account; you can also adjust infra via the cloud console with Encore Cloud auto-syncing.
- **Concrete cloud mapping** (Encore Cloud, [infra docs](https://encore.dev/docs/platform/infrastructure/infra)):

| Resource | AWS | GCP |
|---|---|---|
| **Compute** | Fargate ECS · **EKS** | Cloud Run · **GKE** |
| **SQL (Postgres)** | RDS · **Neon** | Cloud SQL · **Neon** |
| **Pub/Sub** | SNS + SQS | GCP Pub/Sub |
| **Object storage** | S3 / CloudFront | GCS / Cloud CDN |
| **Cache** | ElastiCache (Redis) | Memorystore (Redis) |
| **Secrets** | Secrets Manager | Secret Manager |

- **Environment types:** Local Development · Preview/Development (Encore Cloud Hosting) · Production (your AWS/GCP). **No Azure / Cloudflare / Fly / edge / on-prem** targets.

### AI / agent surface

- **MCP server** that lets AI agents **introspect the application graph** — services, APIs, databases, traces — so agents reason about and validate changes against real structure.
- `encore app create` can **generate AI-tool rules files** (Cursor, Claude Code, …) and wire the MCP server.
- Positioned explicitly for **AI-assisted development**: the fast local→cloud loop lets agents validate against real infra immediately ("intelligence era").

### Pricing (Encore Cloud)

- **Free** (forever): 2 dev environments on Encore Cloud, 1M tracing events/mo, 7-day logs, 1 concurrent build, Discord support.
- **Pro — from $49 / member / mo + infra costs:** unlimited dev envs, 20M traces/mo (then $1.2/1M), 30-day logs, 2 builds, per-PR preview envs, custom domains, deploys to your AWS/GCP, email support + 14-day onboarding. **Plus $99/mo per AWS/GCP environment and $2.5/mo per resource** (service/DB/cron/cache/bucket/topic/subscription/secret).
- **Enterprise** (custom): least-privilege IAM, self-hosted preview environments, custom network-security rules + RBAC, SOC 2 assistance, a TAM, custom SLAs.
- **OSS:** the CLI generates a Docker image for migrating away (MPL-2.0).

## Differentiators

### Strengths (what Encore does well)

- **Real infrastructure-from-code, shipping in production** — the IfC thesis HoBo bets on, validated at scale, with a clean static "application graph."
- **Best-in-class local DX** — `encore run` with **real Postgres + real Pub/Sub + tracing + a `:9400` dashboard + arch diagrams**, per-branch namespaces, and **DB branching** for previews. This is the bar for "works locally predicts works in prod."
- **Type-safe APIs by source-parsing** + **streaming/WebSocket** support + generated clients — strong, low-ceremony end-to-end typing; a **Rust runtime** for boundary perf.
- **Deploys into *your* AWS/GCP** with least-privilege IAM + per-PR preview environments (no vendor-runtime lock-in at the infra layer).
- **AI-native posture** — MCP server for agent introspection, AI-tool rules generation, fast validation loop.
- **OSS core (MPL-2.0)** with a clean OSS/commercial split.

### Gaps (Encore's limits — HoBo's opening)

- **AWS/GCP only; Encore owns provisioning; no pluggable IaC.** No Azure, Cloudflare/Workers, Fly, edge, or on-prem; you **cannot** bring Pulumi/Crossplane/Terraform/OpenTofu or pin specific resources to specific providers. The resource→service mapping is **fixed by Encore's compiler** — you tune knobs in the dashboard/console, but you can't redefine *what a resource maps to*. HoBo is genuinely **multi-cloud + IaC-agnostic** with typed provider-native escape hatches ([Plan 4](../docs/design/control-plane.md#plan-04)/[ADR-0006](../docs/design/adr/01-architecture-core.md#adr-0006)).
- **Narrow data paradigm: Postgres-only SQL, raw SQL, no ORM.** **No first-class document/NoSQL, graph, vector, wide-column, or OLAP** resource — you bolt those on yourself (a raw client to DynamoDB/Mongo/a vector DB), outside the IfC graph and outside the typed surface. This is the **exact surface HoBo formalizes** as a paradigm taxonomy ([ADR-0052](../docs/design/adr/03-data-plane.md#adr-0052)) with **opt-in paradigm packages** (`@hobo/sql`/`vector`/`graph`/`document`, [ADR-0081](../docs/design/adr/03-data-plane.md#adr-0081)) that map to cloud natives by default and stay overridable.
- **TS/Go only** (Python pending) — language-bound, like Convex/Lakebed. HoBo's runtime contract is **language-neutral WIT** (any wasm-compiling language, [Plan 20](../docs/design/wasm-runtime-wit.md#plan-20)).
- **No platform-rules layer.** Fixed resource→service mapping tied to the SDK/compiler; no "same app, different infra per environment, auditably." HoBo adds **Resource Definitions + Matching** so a cheap preview vs a managed-HA prod realization is a recorded `match.Decided` decision ([Plan 25](../docs/design/platform-engineering.md#plan-25)/[ADR-0033](../docs/design/adr/05-config-matching-environments.md#adr-0033)) — and the credit/budget-aware **Dispatcher** ([ADR-0071](../docs/design/adr/05-config-matching-environments.md#adr-0071)) routes by cost.
- **No event-sourced control plane / audit-replay**, no **contracts/`can-deploy`/policy** planes, no **cost** plane beyond Encore Cloud's analytics dashboard, and **no governance/RBAC over the platform itself** outside Enterprise network rules.
- **No cross-cloud data story** — no migration/portability/consistency model (Encore is single-account). HoBo specifies app-data migration ([ADR-0032](../docs/design/adr/03-data-plane.md#adr-0032)) + cross-Camp consistency ([ADR-0040](../docs/design/adr/05-config-matching-environments.md#adr-0040)).
- **No multi-tenant-app primitives.** Encore gives no app-tenant model, tenancy-model spectrum, per-tenant isolation/routing/quota/residency/lifecycle — a SaaS builder rolls their own. HoBo ships this as a capability ([Plan 50](../docs/design/security-networking.md#plan-50)/[ADR-0079](../docs/design/adr/02-identity-security.md#adr-0079)/[ADR-0080](../docs/design/adr/02-identity-security.md#adr-0080)).
- **No AI-generated providers (Forge), no agents-as-principals, no trainable semantic functions.** The AI story is *introspection* (MCP) + assistant rules, not generation/self-healing or AI-as-a-first-class-identity. HoBo's Forge generates adapters ([Plan 23](../docs/design/forge-generated-stack.md#plan-23)), agents carry SVIDs ([Plan 6](../docs/design/ai-native-agent-auth.md#plan-06)), and `"use training"` methods self-optimize.
- **No greenfield-vs-brownfield onboarding.** No documented "import existing infra"; adoption means writing to the SDK, and leaving means the migrate-away Docker image (a rewrite off the SDK). HoBo's `hobo import` adopts TF/Pulumi/Lakebed/FaaS estates **in place** ([ADR-0041](../docs/design/adr/07-portability-extensibility.md#adr-0041)).
- **Value concentrates in Encore Cloud + SDK lock-in.** OSS self-host yields a Docker image but leaves provisioning to you; preview envs / IAM / cost / per-PR DB branching live in the paid platform, and per-resource/per-env pricing scales with surface area. HoBo's **Yard is itself a Bindle** (self-host = hosted parity, [Plan 4](../docs/design/control-plane.md#plan-04)); commercialization is out of design scope ([ADR-0064](../docs/design/adr/08-scope-and-requirements.md#adr-0064)) and metering/showback is OSS FinOps ([ADR-0039](../docs/design/adr/04-governance-verification.md#adr-0039)).

### Comparisons

- **vs HoBo:** Encore is **IfC → AWS/GCP, TS/Go, opinionated, great DX**; HoBo is **IfC → any cloud via pluggable adapters, any wasm language, event-sourced + AI-native + governed**. Encore is the sharpest validation that HoBo's *authoring model* is right and the clearest reminder that HoBo's edge is **breadth (clouds/languages/IaC) + the control-plane planes + data-paradigm breadth + AI-native depth**. On local fidelity, Encore's "real Postgres + real Pub/Sub locally" is the bar `hobo dev` targets — HoBo formalizes it as a **fidelity matrix** (simulate/mock/Camp-only) with **`hobo verify`** splitting local vs Camp checks ([ADR-0042](../docs/design/adr/07-portability-extensibility.md#adr-0042)).
- **vs Nitric:** both are cloud-agnostic-ish IfC; Nitric is more multi-cloud + language-broad via its own runtime, Encore is more opinionated/managed with superior local DX.
- **vs Aspire:** Aspire composes/orchestrates for local-dev + deploy but does not *own* cloud provisioning; Encore provisions managed services directly.
- **vs Dapr:** Dapr offers portable building-block APIs via a sidecar with pluggable components but no provisioning/IfC; Encore provisions but isn't portable across its building blocks the way Dapr's components are. HoBo unifies both: WIT ports (Dapr-like portability) **+** provisioning (Encore-like IfC).
- **vs SST/Pulumi/Terraform:** Encore positions as "IfC, not IaC" — no separate config files; HoBo agrees but keeps IaC tools as **pluggable adapters under** the IfC layer (best of both).
- **vs Convex/Supabase:** managed backends; Encore deploys into *your* cloud account (no vendor-runtime lock-in), closer to HoBo's stance.

**Net:** Encore is HoBo's closest product-shaped competitor on **authoring + DX**, and the gap is **everything HoBo adds around the IfC core**: true multi-cloud + pluggable IaC, a language-neutral wasm runtime, Resource Definitions/Matching + the Dispatcher, **a broad data-paradigm catalog (SQL/vector/graph/document) as opt-in packages that map to cloud natives**, event-sourced governance (cost/policy/contracts), cross-cloud data, multi-tenant-app primitives, and AI-native depth (Forge, agents-as-principals, trainable functions).

## HoBo mapping

> HoBo's equivalent for each Encore concept (✅ has · ➕ goes further · 🔜 planned).

| Encore concept | HoBo equivalent | Notes |
|---|---|---|
| **Infrastructure-from-code** (declare resources in app code) | **IfC authoring** ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) | ✅ same thesis — declare inline, platform collects + provisions |
| Declared resources (DB / pub-sub / object-storage / cache / cron / secrets / APIs) | the HoBo resource catalog (`sql`/`topic`/`bucket`/`kv`/`schedule`/`secret`/`service`) ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) | ✅ near 1:1 |
| **Postgres-only SQL, raw SQL, no other paradigms** | **paradigm taxonomy + opt-in paradigm packages** `@hobo/sql`/`vector`/`graph`/`document` ([ADR-0052](../docs/design/adr/03-data-plane.md#adr-0052)/[ADR-0081](../docs/design/adr/03-data-plane.md#adr-0081)) | ➕ Encore-style typed resource abstractions across SQL **and** vector/graph/document, mapped to cloud natives by default, overridable |
| `api()` functions + streaming (`streamIn/Out/InOut`) + generated clients | typed `service`/`api` primitives + WIT-generated clients ([ADR-0037](../docs/design/adr/05-config-matching-environments.md#adr-0037)); websockets via preview `wasi:websocket` ([ADR-0075](../docs/design/adr/07-portability-extensibility.md#adr-0075)) | ✅ HoBo generates from WIT+Zod+`.allow()`+graph; reactive reads add live `subscribe` |
| Rust request runtime (Encore.ts) | the **Camp's durable runtime** behind WIT ports + the wRPC membrane ([ADR-0069](../docs/design/adr/01-architecture-core.md#adr-0069)) | ↔ different substrate (wasm + event-sourced), same "platform handles the boundary" idea |
| Provisions to **your AWS/GCP** (managed services) | provider adapters across **many clouds** + pluggable IaC ([Plan 4](../docs/design/control-plane.md#plan-04)) | ➕ multi-cloud + Pulumi/Crossplane/TF/OpenTofu as adapters + per-tier mapping |
| **Fixed** resource→service mapping | **Resource Definitions + Matching** ([Plan 25](../docs/design/platform-engineering.md#plan-25)/[ADR-0033](../docs/design/adr/05-config-matching-environments.md#adr-0033)) + the Dispatcher ([ADR-0071](../docs/design/adr/05-config-matching-environments.md#adr-0071)) | ➕ same app → different infra per env, auditable (`match.Decided`), cost-routed |
| `encore run` (real Postgres + Pub/Sub locally) | `hobo dev` on `runtime-local` + **fidelity matrix** ([Plan 7](../docs/design/developer-experience.md#plan-07)/[ADR-0042](../docs/design/adr/07-portability-extensibility.md#adr-0042)) | ✅/➕ HoBo labels simulate/mock/Camp-only + `hobo verify` splits local vs Camp |
| Dev dashboard `:9400` (traces, DB, arch diagram) | dashboard ([Plan 7](../docs/design/developer-experience.md#plan-07)) + observability ([Plan 5](../docs/design/reliability-observability-cost.md#plan-05)) + topology + the **operations dashboard / status pages** ([Plan 49](../docs/design/developer-experience.md#plan-49)) | ✅/➕ multi-cloud/multi-env fleet view + architecture availability |
| Infra **namespaces** / per-PR **preview environments** + DB branching | **ephemeral/preview Camps** + **sandbox lanes** (request-level isolation) ([Plan 25](../docs/design/platform-engineering.md#plan-25)/[ADR-0076](../docs/design/adr/04-governance-verification.md#adr-0076)) | ✅/➕ |
| Self-host (`encore build docker`) vs **Encore Cloud** | self-hostable **Yard-is-a-Bindle** ([Plan 4](../docs/design/control-plane.md#plan-04)); HoBo OSS, commercialization out of design scope ([ADR-0064](../docs/design/adr/08-scope-and-requirements.md#adr-0064)) | ➕ self-host = hosted parity; metering/showback is OSS FinOps, no billing ([ADR-0039](../docs/design/adr/04-governance-verification.md#adr-0039)) |
| Least-privilege IAM (Encore Cloud) | `.allow()` → least-priv IAM + wasm link + token (one decl, three effects) ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) | ✅/➕ |
| **MCP server** for agent introspection | `@hobo/mcp` control surface ([Plan 6](../docs/design/ai-native-agent-auth.md#plan-06)) | ✅/➕ agents are first-class principals with brokered tokens + audit |
| TS/Go (Python coming) | language-neutral **WIT** runtime, any wasm language ([Plan 20](../docs/design/wasm-runtime-wit.md#plan-20)) | ➕ |
| *(none — greenfield-leaning)* | **`hobo import`** adopt-in-place migration ([ADR-0041](../docs/design/adr/07-portability-extensibility.md#adr-0041)) | ➕ adopt existing TF/Pulumi/Lakebed/FaaS estates incrementally |
| *(none)* | **Multi-tenant-app primitives** ([Plan 50](../docs/design/security-networking.md#plan-50)) | ➕ app-tenant model + tenancy spectrum + isolation by construction |
| *(none)* | **Event-sourced control plane + audit/replay** ([Plan 11](../docs/design/data-plane.md#plan-11)) | ➕ |
| *(none)* | **Contracts/`can-deploy` + policy planes** ([Plan 29](../docs/design/contracts-policy-flags.md#plan-29)) | ➕ |
| *(none)* | **Forge** — AI-generated providers/impls ([Plan 23](../docs/design/forge-generated-stack.md#plan-23)) + **trainable semantic functions** | ➕ |
| *(none)* | **Cross-cloud data**: app-data migration ([ADR-0032](../docs/design/adr/03-data-plane.md#adr-0032)) + cross-Camp consistency ([ADR-0040](../docs/design/adr/05-config-matching-environments.md#adr-0040)) | ➕ |

### Encore-as-validation, and the one borrowing HoBo takes

Encore's **resource-abstraction ergonomics** — `new SQLDatabase(...)`, a typed object you import and use, with the platform choosing the managed backing — are exactly what HoBo adopts for its **opt-in paradigm packages** ([ADR-0081](../docs/design/adr/03-data-plane.md#adr-0081)): `@hobo/sql`, `@hobo/vector`, `@hobo/graph`, `@hobo/document` give the same low-ceremony typed abstraction, but (a) across **more paradigms** than Encore's Postgres-only SQL, (b) mapped to **cloud natives selected by Matching** (not a fixed compiler mapping), and (c) **overridable** via `.with()`/escape hatches — keeping Encore's DX while adding HoBo's breadth + auditability.

### The one-line takeaway

**Encore proves HoBo's IfC authoring model + local DX in production** — and maps cleanly onto Plans 21/22/15/26 — but is bounded to **AWS/GCP + TS/Go + Postgres-only data + a fixed mapping + a deploy pipeline**. HoBo's differentiation is the surrounding system: **any-cloud + pluggable-IaC breadth, a language-neutral wasm runtime, Resource Definitions/Matching + the Dispatcher, a broad data-paradigm catalog as opt-in packages, event-sourced governance (cost/policy/contracts), cross-cloud data, multi-tenant-app primitives, and AI-native depth (Forge, agents-as-principals, trainable functions).**
