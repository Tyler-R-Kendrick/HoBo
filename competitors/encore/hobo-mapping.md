# Encore → HoBo mapping

> Part of the [Encore reference](./README.md). HoBo's equivalent for each Encore concept (✅ has · ➕ goes further · 🔜 planned).

| Encore concept | HoBo equivalent | Notes |
|---|---|---|
| **Infrastructure-from-code** (declare resources in app code) | **IfC authoring** ([Plan 21](../../docs/design/21-resources-catalog.md)/[Plan 22](../../docs/design/22-wiring-manifest.md)) | ✅ same thesis — declare inline, platform collects + provisions |
| Declared resources (DB / pub-sub / object-storage / cache / cron / secrets / APIs) | the HoBo resource catalog (`sql`/`topic`/`bucket`/`kv`/`schedule`/`secret`/`service`) ([Plan 21](../../docs/design/21-resources-catalog.md)) | ✅ near 1:1 |
| Type-safe service-to-service APIs + generated clients | typed `ctx.bindings` + WIT-generated clients ([ADR-0037](../../docs/design/adr/ADR-0037-sdk-codegen-surface.md)) | ✅ HoBo generates from WIT+Zod+`.allow()`+graph |
| Provisions to **your AWS/GCP** (managed services) | provider adapters across **many clouds** + pluggable IaC ([Plan 3](../../docs/design/03-providers-iac.md)) | ➕ multi-cloud + Pulumi/Crossplane/TF/OpenTofu as adapters + per-tier mapping |
| Fixed resource→service mapping | **Resource Definitions + Matching** ([Plan 25](../../docs/design/25-resource-definitions-matching.md)/[ADR-0033](../../docs/design/adr/ADR-0033-deterministic-matching-and-planner-selection.md)) | ➕ same app → different infra per env, auditable (`match.Decided`) |
| `encore run` (real Postgres + pub/sub locally) | `hobo dev` on `runtime-local` + **fidelity matrix** ([Plan 15](../../docs/design/15-cli-dx.md)/[ADR-0042](../../docs/design/adr/ADR-0042-local-dev-fidelity.md)) | ✅/➕ HoBo labels simulate/mock/Camp-only + `hobo verify` splits local vs Camp |
| Dev dashboard `:9400` (traces, DB, arch diagram) | dashboard ([Plan 7](../../docs/design/07-ui-dashboard.md)) + observability ([Plan 14](../../docs/design/14-observability.md)) + topology graph | ✅ |
| Infra **namespaces** / per-PR **preview environments** | **ephemeral/preview Camps + Deltas→Sets** ([Plan 26](../../docs/design/26-environments-deltas.md)) | ✅ |
| Self-host (`encore build docker`) vs **Encore Cloud** | self-hostable **Yard-is-a-Bindle** ([Plan 4](../../docs/design/04-control-plane.md)) + hosted Yard ([ADR-0020](../../docs/design/adr/ADR-0020-monetization-model.md)) | ➕ self-host = hosted parity; metering/showback OSS, only chargeback hosted ([ADR-0039](../../docs/design/adr/ADR-0039-billing-quota-cost-attribution.md)) |
| Least-privilege IAM (Encore Cloud) | `.allow()` → least-priv IAM + wasm link + token (one decl, three effects) ([Plan 21](../../docs/design/21-resources-catalog.md)) | ✅/➕ |
| **MCP server** for agent introspection | `@hobo/mcp` control surface ([Plan 6](../../docs/design/06-ai-native-agent-auth.md)) | ✅/➕ agents are first-class principals with brokered tokens + audit |
| TS/Go (Python coming) | language-neutral **WIT** runtime, any wasm language ([Plan 20](../../docs/design/20-wasm-wasi-runtime.md)) | ➕ |
| *(none — greenfield-leaning)* | **`hobo import`** adopt-in-place migration ([ADR-0041](../../docs/design/adr/ADR-0041-migration-onboarding.md)) | ➕ adopt existing TF/Pulumi/Lakebed/FaaS estates incrementally |
| *(none)* | **Event-sourced control plane + audit/replay** ([Plan 11](../../docs/design/11-event-model.md)) | ➕ |
| *(none)* | **Contracts/`can-deploy` + policy planes** ([Plan 29](../../docs/design/29-contracts-compatibility.md)/[Plan 30](../../docs/design/30-policy-plane.md)) | ➕ |
| *(none)* | **Forge** — AI-generated providers/impls ([Plan 33](../../docs/design/33-forge-generation-pipeline.md)) + **trainable semantic functions** ([Plan 23](../../docs/design/23-stubbable-ai-implementations.md)) | ➕ |
| *(none)* | **Cross-cloud data**: app-data migration ([ADR-0032](../../docs/design/adr/ADR-0032-data-portability-schema-versioning.md)) + cross-Camp consistency ([ADR-0040](../../docs/design/adr/ADR-0040-cross-camp-stateful-consistency.md)) | ➕ |

## The one-line takeaway
**Encore proves HoBo's IfC authoring model + local DX in production** — and maps cleanly onto Plans 21/22/15/26 — but is bounded to **AWS/GCP + TS/Go + fixed mapping + a deploy pipeline**. HoBo's differentiation is the surrounding system: **any-cloud + pluggable-IaC breadth, a language-neutral wasm runtime, Resource Definitions/Matching, event-sourced governance (cost/policy/contracts), cross-cloud data, and AI-native depth (Forge, agents-as-principals).**
