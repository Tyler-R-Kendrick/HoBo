# Convex → HoBo parity & mapping tracker

> For each Convex surface, the HoBo equivalent. ✅ = HoBo has a comparable concept · ➕ = HoBo goes further · ↔ = adjacent/composes · n/a = out of scope. HoBo design lives in [`../../docs/design/`](../../docs/design/README.md). Convex is **adjacent** to HoBo — a managed reactive backend, not a multi-cloud control plane — so this tracks *conceptual* correspondences (and where Convex could be a HoBo provider), not feature-for-feature competition.

## Core platform
| Convex | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Deterministic reactive queries; consistent snapshots | Event-sourced, deterministic **replay** + projections; durable workflows | ↔➕ | [11](../../docs/design/11-event-model.md) |
| Mutations = OCC serializable transactions | Single-writer actor leases + exactly-once effects | ✅ | [05](../../docs/design/05-reliability-ha.md) |
| Actions (external calls; Node runtime) | Provider/driver calls in sandboxed Executors; durable `step`/`workflow` | ✅ | [02](../../docs/design/02-sdk-api.md), [04](../../docs/design/04-control-plane.md) |
| Document DB + schema + indexes + vector search | A **capability/resource** in HoBo's catalog (`database`/`vector`/`blobstore` ports) | ↔ | [21](../../docs/design/21-resources-catalog.md), [24](../../docs/design/24-wit-interfaces-reference.md) |
| Scheduled functions + cron | Saga scheduling + Pipelines/triggers | ✅ | [05](../../docs/design/05-reliability-ha.md), [28](../../docs/design/28-agent-gitops-pipelines.md) |
| HTTP actions / webhooks | Provider HTTP ports + GitOps/webhook triggers | ✅ | [22](../../docs/design/22-wiring-manifest.md), [28](../../docs/design/28-agent-gitops-pipelines.md) |

## The three user-emphasized surfaces
| Convex | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| **Generated code** (`_generated/` `api`/`server`/`dataModel`; typed function refs) | **WIT-interface-generated typed clients** + typed `.with(...)`; codegen from ports | ✅➕ | [02](../../docs/design/02-sdk-api.md), [24](../../docs/design/24-wit-interfaces-reference.md), [20](../../docs/design/20-wasm-wasi-runtime.md) |
| **Deployment API/model** (`convex deploy`, deploy keys, dev/prod/preview, CI) | The **Yard** deploy lifecycle: manifest/Set, Deltas→Sets, ephemeral/preview Camps, publishers | ✅➕ | [04](../../docs/design/04-control-plane.md), [22](../../docs/design/22-wiring-manifest.md), [26](../../docs/design/26-environments-deltas.md) |
| **Management/Platform API** (`api.convex.dev/v1`, OAuth apps, provision deployments) | The Yard's control-plane API + MCP + agents-as-OIDC-principals provisioning | ✅➕ | [04](../../docs/design/04-control-plane.md), [06](../../docs/design/06-ai-native-agent-auth.md) |

## Ops, extensibility & auth
| Convex | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Components (sandboxed reusable backends) | Capability providers + **Resource Packs** (signed, conformance-gated) | ✅➕ | [27](../../docs/design/27-drivers-packs-profiles.md), [03](../../docs/design/03-providers-iac.md) |
| Log streams / exceptions / dashboard | Observability + run inspector + replay | ✅➕ | [14](../../docs/design/14-observability.md), [07](../../docs/design/07-ui-dashboard.md) |
| Self-host (Rust backend; FSL→Apache) | Self-host = hosted (the Yard is a Bindle); OSS core | ✅ | [04](../../docs/design/04-control-plane.md), [17](../../docs/design/17-positioning-competitive.md) |
| Auth: `customJwt`/OIDC (Convex Auth/Clerk/Auth0) | Workload/agent identity (SVIDs, OIDC principals); **shoo** composes via `customJwt` | ↔ | [06](../../docs/design/06-ai-native-agent-auth.md), [12](../../docs/design/12-security-multitenancy.md), [../shoo](../shoo/README.md) |
| AI: MCP server + agent skills | Agents-as-principals + MCP control surface + Forge | ✅➕ | [06](../../docs/design/06-ai-native-agent-auth.md), [23](../../docs/design/23-stubbable-ai-implementations.md) |

## Convex-as-a-HoBo-provider (the composing relationship)
The cleanest framing: **Convex is a backend HoBo could realize as a capability provider**. A Bindle that declares `database`/`vector`/`blobstore`/`auth` ports could be mapped (via a Resource Definition, [Plan 25](../../docs/design/25-resource-definitions-matching.md)) to a Convex deployment — HoBo's Planner would provision it through Convex's **Management API**, wire connection refs via the manifest ([Plan 22](../../docs/design/22-wiring-manifest.md)), and brokers/agents would manage it. In that framing Convex is *infrastructure HoBo orchestrates*, not a competitor.

## Where HoBo deliberately differs
- **Multi-cloud + IaC + matching** — HoBo provisions *across providers* by context ([Plan 25](../../docs/design/25-resource-definitions-matching.md)); Convex is one backend.
- **Event-sourced replay/time-travel + audit** as the substrate ([Plan 11](../../docs/design/11-event-model.md)).
- **WASM-first polyglot runtime** ([Plan 20](../../docs/design/20-wasm-wasi-runtime.md)) vs Convex's TS/JS runtime.
- **Agent-native Forge** generation of providers/implementations/definitions ([Plan 23](../../docs/design/23-stubbable-ai-implementations.md)).
