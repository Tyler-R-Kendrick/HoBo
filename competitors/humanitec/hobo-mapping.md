# Humanitec → HoBo parity & mapping tracker

> For every Humanitec feature, the HoBo equivalent and the design doc that owns it. ✅ = designed at parity · ➕ = HoBo goes further · 🔜 = planned/roadmap. HoBo design lives in [`../../docs/design/`](../../docs/design/README.md).

## Core engine
| Humanitec | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Dynamic configuration management (Score + Resource Definitions + Matching) | **Resource Definitions + Matching** as the Planner's platform-rules layer; mapping = sugar over default definitions | ✅➕ | [25](../../docs/design/platform-engineering.md#plan-25) |
| Resource Definition | HoBo Resource Definition (**WIT-interface-typed**, Forge-generatable) | ➕ | [25](../../docs/design/platform-engineering.md#plan-25) |
| Matching Criteria (specificity scoring) | Same model; the winning definition + score recorded as a **`match.Decided`** event (auditable "why this infra") | ➕ | [25](../../docs/design/platform-engineering.md#plan-25), [11](../../docs/design/event-model.md#plan-11) |
| Resource classes (`standard`/`ha`/…) | Resource `class` as a matching dimension | ✅ | [21](../../docs/design/authoring-resources-wiring.md#plan-21) |
| Resource Graph (DAG, co-provision, outputs) | DeploymentPlan DAG + ResourceActors + manifest links | ✅ | [03](../../docs/design/control-plane.md#plan-03), [04](../../docs/design/control-plane.md#plan-04) |
| Drivers (terraform/template/echo/container/custom-webhook) | **Driver taxonomy** generalizing IaC adapters (incl. echo/BYO + webhook) | ✅ | [27](../../docs/design/platform-engineering.md#plan-27), [03](../../docs/design/control-plane.md#plan-03) |
| Deployment Sets (immutable) + Deltas (mutable) | **Set = manifest IR**, **Delta = event-sourced diff**; promote/rollback/incremental | ✅➕ | [26](../../docs/design/platform-engineering.md#plan-26), [22](../../docs/design/authoring-resources-wiring.md#plan-22) |
| Placeholders (`${resources..outputs}`, `${context.*}`) | Aspire-style lazy refs aligned to this syntax | ✅ | [22](../../docs/design/authoring-resources-wiring.md#plan-22) |
| Score workload spec | HoBo IfC resources + WIT ports; **Score importable** (interop) | ✅➕ | [02](../../docs/design/sdk-api.md#plan-02), [21](../../docs/design/authoring-resources-wiring.md#plan-21) |
| Shared / active / implicit resources | Shared resources + ResourceActors + implicit scaffolding | ✅ | [04](../../docs/design/control-plane.md#plan-04) |

## Environments & lifecycle
| Humanitec | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Applications / Environments / Environment Types | Bindle / **Camp** with **environment type** (matching dimension) | ✅ | [26](../../docs/design/platform-engineering.md#plan-26) |
| Env cloning | Camp `clone-from` | ✅ | [26](../../docs/design/platform-engineering.md#plan-26) |
| Ephemeral / dynamic (per-PR) environments | Ephemeral/preview Camps (auto-TTL) | ✅ | [26](../../docs/design/platform-engineering.md#plan-26) |
| Workload Profiles | **Workload Profiles** (wasm-component/container/serverless/VM) | ✅ | [27](../../docs/design/platform-engineering.md#plan-27) |
| Rollback / incremental deploys | Event-sourced rollback + incremental reconcile | ✅ | [26](../../docs/design/platform-engineering.md#plan-26), [04](../../docs/design/control-plane.md#plan-04) |

## Platform & operations
| Humanitec | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Portal (golden paths, catalogs, scorecards) | HoBo dashboard + resource-graph/matching/delta/pipeline views | ✅ | [07](../../docs/design/developer-experience.md#plan-07) |
| Agent (private-network reverse tunnel) | **HoBo Relay** (outbound-only; Executors run behind it) | ✅ | [28](../../docs/design/platform-engineering.md#plan-28), [12](../../docs/design/security-networking.md#plan-12), [13](../../docs/design/security-networking.md#plan-13) |
| Operator (secret provisioning) | Provider `secrets` port + brokered tokens | ✅ | [06](../../docs/design/ai-native-agent-auth.md#plan-06), [12](../../docs/design/security-networking.md#plan-12) |
| Pipelines (triggers + approval gates) | **Pipelines** atop sagas + policy gates | ✅ | [28](../../docs/design/platform-engineering.md#plan-28), [05](../../docs/design/reliability-observability-cost.md#plan-05) |
| GitOps mode (write CRs to Git) | **GitOps publisher** target | ✅ | [28](../../docs/design/platform-engineering.md#plan-28), [22](../../docs/design/authoring-resources-wiring.md#plan-22) |
| Resource Packs | **Resource Packs** in the Registry (Forge-generatable) | ➕ | [27](../../docs/design/platform-engineering.md#plan-27), [06](../../docs/design/ai-native-agent-auth.md#plan-06) |
| RBAC + approvals | ABAC + policy gates | ✅ | [12](../../docs/design/security-networking.md#plan-12), [06](../../docs/design/ai-native-agent-auth.md#plan-06) |
| Audit logs (365d, immutable) | Event log **is** the audit log (replayable) | ➕ | [11](../../docs/design/event-model.md#plan-11), [14](../../docs/design/reliability-observability-cost.md#plan-14) |
| Drift detection | Drift loop (heal/propose/ignore) | ✅ | [05](../../docs/design/reliability-observability-cost.md#plan-05) |
| CI/CD integration | CLI/MCP + Pipelines + artifact triggers | ✅ | [15](../../docs/design/developer-experience.md#plan-15), [28](../../docs/design/platform-engineering.md#plan-28) |
| MCP (AI agents drive it) | `@hobo/mcp` (agents as first-class principals) | ➕ | [06](../../docs/design/ai-native-agent-auth.md#plan-06) |
| Self-hosted + air-gapped | Self-host = hosted (the Yard is a Bindle) + Agent | ✅ | [04](../../docs/design/control-plane.md#plan-04) |
| IDP "5-plane" framing | HoBo = Integration & Delivery plane orchestrator | ✅ | [00](../../docs/design/vision.md#plan-00), [17](../../docs/design/positioning.md#plan-17) |

## Where HoBo deliberately exceeds Humanitec
| Capability | HoBo doc |
|---|---|
| **Auditable matching** (`match.Decided` events — "why this infra", replayable) | [25](../../docs/design/platform-engineering.md#plan-25), [11](../../docs/design/event-model.md#plan-11) |
| **WASM-first polyglot runtime** (not K8s-centric) | [20](../../docs/design/wasm-runtime-wit.md#plan-20) |
| **Event-sourced replay/time-travel + DR-as-replay** | [11](../../docs/design/event-model.md#plan-11), [05](../../docs/design/reliability-observability-cost.md#plan-05) |
| **Forge-generated Resource Definitions, Packs & implementations** (not human-only) | [23](../../docs/design/forge-generated-stack.md#plan-23), [06](../../docs/design/ai-native-agent-auth.md#plan-06) |
| **IfC-default simplicity** + mapping-as-sugar (lower learning curve) | [02](../../docs/design/sdk-api.md#plan-02), [25](../../docs/design/platform-engineering.md#plan-25) |
| **OSS core + WIT-standard ports** (less lock-in) | [17](../../docs/design/positioning.md#plan-17), [24](../../docs/design/wasm-runtime-wit.md#plan-24) |

## Open parity items (iteration hooks)
- Resource Definition authoring surface: TS (typed) vs YAML (Humanitec-parity) vs both.
- Whether `echo`/BYO resources participate in drift/reconcile or are read-only.
- Agent transport + multi-cluster routing details.
- Matching scoring exactly mirroring Humanitec vs a HoBo refinement (explicit priorities).
