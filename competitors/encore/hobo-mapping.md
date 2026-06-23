# Encore → HoBo mapping

> Part of the [Encore reference](./README.md). HoBo's equivalent for each Encore concept (✅ has · ➕ goes further · 🔜 planned).

| Encore concept | HoBo equivalent | Notes |
|---|---|---|
| **Infrastructure-from-code** (declare resources in app code) | **IfC authoring** ([Plan 21](../../docs/design/authoring-resources-wiring.md#plan-21)/[Plan 22](../../docs/design/authoring-resources-wiring.md#plan-22)) | ✅ same thesis — declare inline, platform collects + provisions |
| Declared resources (DB / pub-sub / object-storage / cache / cron / secrets / APIs) | the HoBo resource catalog (`sql`/`topic`/`bucket`/`kv`/`schedule`/`secret`/`service`) ([Plan 21](../../docs/design/authoring-resources-wiring.md#plan-21)) | ✅ near 1:1 |
| Type-safe service-to-service APIs + generated clients | typed `ctx.bindings` + WIT-generated clients ([ADR-0037](../../docs/design/adr/05-config-matching-environments.md#adr-0037)) | ✅ HoBo generates from WIT+Zod+`.allow()`+graph |
| Provisions to **your AWS/GCP** (managed services) | provider adapters across **many clouds** + pluggable IaC ([Plan 3](../../docs/design/control-plane.md#plan-03)) | ➕ multi-cloud + Pulumi/Crossplane/TF/OpenTofu as adapters + per-tier mapping |
| Fixed resource→service mapping | **Resource Definitions + Matching** ([Plan 25](../../docs/design/platform-engineering.md#plan-25)/[ADR-0033](../../docs/design/adr/05-config-matching-environments.md#adr-0033)) | ➕ same app → different infra per env, auditable (`match.Decided`) |
| `encore run` (real Postgres + pub/sub locally) | `hobo dev` on `runtime-local` + **fidelity matrix** ([Plan 15](../../docs/design/developer-experience.md#plan-15)/[ADR-0042](../../docs/design/adr/07-portability-extensibility.md#adr-0042)) | ✅/➕ HoBo labels simulate/mock/Camp-only + `hobo verify` splits local vs Camp |
| Dev dashboard `:9400` (traces, DB, arch diagram) | dashboard ([Plan 7](../../docs/design/developer-experience.md#plan-07)) + observability ([Plan 14](../../docs/design/reliability-observability-cost.md#plan-14)) + topology graph | ✅ |
| Infra **namespaces** / per-PR **preview environments** | **ephemeral/preview Camps + Deltas→Sets** ([Plan 26](../../docs/design/platform-engineering.md#plan-26)) | ✅ |
| Self-host (`encore build docker`) vs **Encore Cloud** | self-hostable **Yard-is-a-Bindle** ([Plan 4](../../docs/design/control-plane.md#plan-04)); HoBo is OSS, commercialization out of design scope ([ADR-0064](../../docs/design/adr/08-scope-and-requirements.md#adr-0064)) | ➕ self-host = hosted parity; metering/showback is OSS FinOps, no billing ([ADR-0039](../../docs/design/adr/04-governance-verification.md#adr-0039)) |
| Least-privilege IAM (Encore Cloud) | `.allow()` → least-priv IAM + wasm link + token (one decl, three effects) ([Plan 21](../../docs/design/authoring-resources-wiring.md#plan-21)) | ✅/➕ |
| **MCP server** for agent introspection | `@hobo/mcp` control surface ([Plan 6](../../docs/design/ai-native-agent-auth.md#plan-06)) | ✅/➕ agents are first-class principals with brokered tokens + audit |
| TS/Go (Python coming) | language-neutral **WIT** runtime, any wasm language ([Plan 20](../../docs/design/wasm-runtime-wit.md#plan-20)) | ➕ |
| *(none — greenfield-leaning)* | **`hobo import`** adopt-in-place migration ([ADR-0041](../../docs/design/adr/07-portability-extensibility.md#adr-0041)) | ➕ adopt existing TF/Pulumi/Lakebed/FaaS estates incrementally |
| *(none)* | **Event-sourced control plane + audit/replay** ([Plan 11](../../docs/design/event-model.md#plan-11)) | ➕ |
| *(none)* | **Contracts/`can-deploy` + policy planes** ([Plan 29](../../docs/design/contracts-policy-flags.md#plan-29)/[Plan 30](../../docs/design/contracts-policy-flags.md#plan-30)) | ➕ |
| *(none)* | **Forge** — AI-generated providers/impls ([Plan 33](../../docs/design/forge-generated-stack.md#plan-33)) + **trainable semantic functions** ([Plan 23](../../docs/design/forge-generated-stack.md#plan-23)) | ➕ |
| *(none)* | **Cross-cloud data**: app-data migration ([ADR-0032](../../docs/design/adr/03-data-plane.md#adr-0032)) + cross-Camp consistency ([ADR-0040](../../docs/design/adr/05-config-matching-environments.md#adr-0040)) | ➕ |

## The one-line takeaway
**Encore proves HoBo's IfC authoring model + local DX in production** — and maps cleanly onto Plans 21/22/15/26 — but is bounded to **AWS/GCP + TS/Go + fixed mapping + a deploy pipeline**. HoBo's differentiation is the surrounding system: **any-cloud + pluggable-IaC breadth, a language-neutral wasm runtime, Resource Definitions/Matching, event-sourced governance (cost/policy/contracts), cross-cloud data, and AI-native depth (Forge, agents-as-principals).**
