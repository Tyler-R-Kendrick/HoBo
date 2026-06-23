# Convex → HoBo parity & mapping tracker

> For each Convex surface, the HoBo equivalent. ✅ = HoBo has a comparable concept · ➕ = HoBo goes further · ↔ = adjacent/composes · n/a = out of scope. HoBo design lives in [`../../docs/design/`](../../docs/design/README.md). Convex is **adjacent** to HoBo — a managed reactive backend, not a multi-cloud control plane — so this tracks *conceptual* correspondences (and where Convex could be a HoBo provider), not feature-for-feature competition.

## Core platform
| Convex | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Deterministic reactive queries; consistent snapshots | Event-sourced, deterministic **replay** + projections; durable workflows | ↔➕ | [11](../../docs/design/event-model.md#plan-11) |
| Mutations = OCC serializable transactions | Single-writer actor leases + exactly-once effects | ✅ | [05](../../docs/design/reliability-observability-cost.md#plan-05) |
| Actions (external calls; Node runtime) | Provider/driver calls in sandboxed Executors; durable `step`/`workflow` | ✅ | [02](../../docs/design/sdk-api.md#plan-02), [04](../../docs/design/control-plane.md#plan-04) |
| Document DB + schema + indexes + vector search | A **capability/resource** in HoBo's catalog (`database`/`vector`/`blobstore` ports) | ↔ | [21](../../docs/design/authoring-resources-wiring.md#plan-21), [24](../../docs/design/wasm-runtime-wit.md#plan-24) |
| Scheduled functions + cron | Saga scheduling + Pipelines/triggers | ✅ | [05](../../docs/design/reliability-observability-cost.md#plan-05), [28](../../docs/design/platform-engineering.md#plan-28) |
| HTTP actions / webhooks | Provider HTTP ports + GitOps/webhook triggers | ✅ | [22](../../docs/design/authoring-resources-wiring.md#plan-22), [28](../../docs/design/platform-engineering.md#plan-28) |

## The three user-emphasized surfaces
| Convex | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| **Generated code** (`_generated/` `api`/`server`/`dataModel`; typed function refs) | **WIT-interface-generated typed clients** + typed `.with(...)`; codegen from ports | ✅➕ | [02](../../docs/design/sdk-api.md#plan-02), [24](../../docs/design/wasm-runtime-wit.md#plan-24), [20](../../docs/design/wasm-runtime-wit.md#plan-20) |
| **Deployment API/model** (`convex deploy`, deploy keys, dev/prod/preview, CI) | The **Yard** deploy lifecycle: manifest/Set, Deltas→Sets, ephemeral/preview Camps, publishers | ✅➕ | [04](../../docs/design/control-plane.md#plan-04), [22](../../docs/design/authoring-resources-wiring.md#plan-22), [26](../../docs/design/platform-engineering.md#plan-26) |
| **Management/Platform API** (`api.convex.dev/v1`, OAuth apps, provision deployments) | The Yard's control-plane API + MCP + agents-as-OIDC-principals provisioning | ✅➕ | [04](../../docs/design/control-plane.md#plan-04), [06](../../docs/design/ai-native-agent-auth.md#plan-06) |

## Ops, extensibility & auth
| Convex | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Components (sandboxed reusable backends) | Capability providers + **Resource Packs** (signed, conformance-gated) | ✅➕ | [27](../../docs/design/platform-engineering.md#plan-27), [03](../../docs/design/control-plane.md#plan-03) |
| Log streams / exceptions / dashboard | Observability + run inspector + replay | ✅➕ | [14](../../docs/design/reliability-observability-cost.md#plan-14), [07](../../docs/design/developer-experience.md#plan-07) |
| Self-host (Rust backend; FSL→Apache) | Self-host = hosted (the Yard is a Bindle); OSS core | ✅ | [04](../../docs/design/control-plane.md#plan-04), [17](../../docs/design/positioning.md#plan-17) |
| Auth: `customJwt`/OIDC (Convex Auth/Clerk/Auth0) | Workload/agent identity (SVIDs, OIDC principals); **shoo** composes via `customJwt` | ↔ | [06](../../docs/design/ai-native-agent-auth.md#plan-06), [12](../../docs/design/security-networking.md#plan-12), [../shoo](../shoo/README.md) |
| AI: MCP server + agent skills | Agents-as-principals + MCP control surface + Forge | ✅➕ | [06](../../docs/design/ai-native-agent-auth.md#plan-06), [23](../../docs/design/forge-generated-stack.md#plan-23) |

## Convex-as-a-HoBo-provider (the composing relationship)
The cleanest framing: **Convex is a backend HoBo could realize as a capability provider**. A Bindle that declares `database`/`vector`/`blobstore`/`auth` ports could be mapped (via a Resource Definition, [Plan 25](../../docs/design/platform-engineering.md#plan-25)) to a Convex deployment — HoBo's Planner would provision it through Convex's **Management API**, wire connection refs via the manifest ([Plan 22](../../docs/design/authoring-resources-wiring.md#plan-22)), and brokers/agents would manage it. In that framing Convex is *infrastructure HoBo orchestrates*, not a competitor.

## Where HoBo deliberately differs
- **Multi-cloud + IaC + matching** — HoBo provisions *across providers* by context ([Plan 25](../../docs/design/platform-engineering.md#plan-25)); Convex is one backend.
- **Event-sourced replay/time-travel + audit** as the substrate ([Plan 11](../../docs/design/event-model.md#plan-11)).
- **WASM-first polyglot runtime** ([Plan 20](../../docs/design/wasm-runtime-wit.md#plan-20)) vs Convex's TS/JS runtime.
- **Agent-native Forge** generation of providers/implementations/definitions ([Plan 23](../../docs/design/forge-generated-stack.md#plan-23)).
