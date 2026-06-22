# Encore — differentiators & gaps (vs HoBo)

> Part of the [Encore reference](./README.md). Where Encore is strong, where it stops, and how that frames HoBo.

## Strengths (what Encore does well)
- **Real infrastructure-from-code, shipping in production.** Declare resources in TS/Go; Encore builds the app graph and provisions managed services — the IfC thesis HoBo bets on, validated at scale.
- **Excellent local DX.** `encore run` with **real Postgres + real pub/sub + tracing + a dashboard (`:9400`)** and per-branch infra namespaces — the gold standard for "works locally predicts works in prod."
- **Type-safe service-to-service APIs** with generated clients — strong end-to-end typing.
- **Deploys into *your* AWS/GCP account** with least-privilege IAM + per-PR preview environments (Encore Cloud).
- **AI-native posture:** MCP server for agent introspection, AI-tool rules generation, fast local→cloud validation loop.
- **OSS core (MPL-2.0)** with a clean OSS/commercial split.

## Gaps (Encore's limits — HoBo's opening)
- **AWS/GCP only; Encore owns provisioning.** No Azure/Cloudflare/edge/on-prem, and **no pluggable IaC** — you can't bring Pulumi/Crossplane/Terraform or pin specific boundaries to specific providers. HoBo is genuinely **multi-cloud + IaC-agnostic** with typed provider-native escape hatches ([Plan 3](../../docs/design/03-providers-iac.md)).
- **TS/Go only** (Python pending). HoBo's runtime contract is **language-neutral WIT** (any wasm-compiling language, [Plan 20](../../docs/design/20-wasm-wasi-runtime.md)).
- **No platform-rules layer.** Fixed resource→service mapping; HoBo adds **Resource Definitions + Matching** so the *same* app realizes different infra per environment, auditably ([Plan 25](../../docs/design/25-resource-definitions-matching.md)/[ADR-0033](../../docs/design/adr/ADR-0033-deterministic-matching-and-planner-selection.md)).
- **No event-sourced control plane / audit-replay**, no **contracts/`can-deploy`/policy** planes, no **cost** plane beyond Encore Cloud analytics.
- **No cross-cloud data story** (migration/portability/consistency) — HoBo specifies app-data migration ([ADR-0032](../../docs/design/adr/ADR-0032-data-portability-schema-versioning.md)) + cross-Camp consistency ([ADR-0040](../../docs/design/adr/ADR-0040-cross-camp-stateful-consistency.md)).
- **No AI-generated providers** (Forge), no **agents-as-principals**, no **trainable semantic functions**.
- **Framework lock-in.** IfC is coupled to Encore's SDK/compiler; migrating off is a rewrite. HoBo's `hobo import` adopts existing estates in place ([ADR-0041](../../docs/design/adr/ADR-0041-migration-onboarding.md)).

## Comparisons
- **vs HoBo:** Encore is **IfC → AWS/GCP, TS/Go, opinionated, great DX**; HoBo is **IfC → any cloud via pluggable adapters, any wasm language, event-sourced + AI-native + governed**. Encore is the sharpest validation that HoBo's *authoring model* is right and the clearest reminder that HoBo's edge is **breadth (clouds/languages/IaC) + the control-plane planes + AI-native depth**.
- **vs Nitric:** both are cloud-agnostic-ish IfC; Nitric is more multi-cloud + language-broad via its own runtime, Encore is more opinionated/managed with superior local DX.
- **vs Aspire:** Aspire composes/orchestrates for local-dev + deploy but doesn't *own* cloud provisioning; Encore provisions managed services directly.
- **vs SST/Pulumi/Terraform:** Encore positions against these as "IfC, not IaC" — no separate config files; HoBo agrees but keeps IaC tools as **pluggable adapters under** the IfC layer (best of both).
- **vs Convex/Supabase:** those are managed backends; Encore deploys into *your* cloud account (no vendor-runtime lock-in), closer to HoBo's stance.

**Net:** Encore is HoBo's closest product-shaped competitor on **authoring + DX**, and the gap is **everything HoBo adds around the IfC core**: true multi-cloud + pluggable IaC, language-neutral wasm runtime, Resource Definitions/Matching, event-sourced governance (cost/policy/contracts), cross-cloud data, and AI-native depth (Forge, agents-as-principals, trainable functions).
