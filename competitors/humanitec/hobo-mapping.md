# Humanitec → HoBo parity & mapping tracker

> For every Humanitec feature, the HoBo equivalent and the design doc that owns it. ✅ = designed at parity · ➕ = HoBo goes further · 🔜 = planned/roadmap. HoBo design lives in [`../../docs/design/`](../../docs/design/README.md).

## Core engine
| Humanitec | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Dynamic configuration management (Score + Resource Definitions + Matching) | **Resource Definitions + Matching** as the Planner's platform-rules layer; mapping = sugar over default definitions | ✅➕ | [25](../../docs/design/25-resource-definitions-matching.md) |
| Resource Definition | HoBo Resource Definition (**WIT-world-typed**, Forge-generatable) | ➕ | [25](../../docs/design/25-resource-definitions-matching.md) |
| Matching Criteria (specificity scoring) | Same model; the winning definition + score recorded as a **`match.Decided`** event (auditable "why this infra") | ➕ | [25](../../docs/design/25-resource-definitions-matching.md), [11](../../docs/design/11-event-model.md) |
| Resource classes (`standard`/`ha`/…) | Resource `class` as a matching dimension | ✅ | [21](../../docs/design/21-resources-catalog.md) |
| Resource Graph (DAG, co-provision, outputs) | DeploymentPlan DAG + ResourceActors + manifest links | ✅ | [03](../../docs/design/03-providers-iac.md), [04](../../docs/design/04-control-plane.md) |
| Drivers (terraform/template/echo/container/custom-webhook) | **Driver taxonomy** generalizing IaC adapters (incl. echo/BYO + webhook) | ✅ | [27](../../docs/design/27-drivers-packs-profiles.md), [03](../../docs/design/03-providers-iac.md) |
| Deployment Sets (immutable) + Deltas (mutable) | **Set = manifest IR**, **Delta = event-sourced diff**; promote/rollback/incremental | ✅➕ | [26](../../docs/design/26-environments-deltas.md), [22](../../docs/design/22-wiring-manifest.md) |
| Placeholders (`${resources..outputs}`, `${context.*}`) | Aspire-style lazy refs aligned to this syntax | ✅ | [22](../../docs/design/22-wiring-manifest.md) |
| Score workload spec | HoBo IfC resources + WIT ports; **Score importable** (interop) | ✅➕ | [02](../../docs/design/02-sdk-api.md), [21](../../docs/design/21-resources-catalog.md) |
| Shared / active / implicit resources | Shared resources + ResourceActors + implicit scaffolding | ✅ | [04](../../docs/design/04-control-plane.md) |

## Environments & lifecycle
| Humanitec | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Applications / Environments / Environment Types | Bindle / **Camp** with **environment type** (matching dimension) | ✅ | [26](../../docs/design/26-environments-deltas.md) |
| Env cloning | Camp `clone-from` | ✅ | [26](../../docs/design/26-environments-deltas.md) |
| Ephemeral / dynamic (per-PR) environments | Ephemeral/preview Camps (auto-TTL) | ✅ | [26](../../docs/design/26-environments-deltas.md) |
| Workload Profiles | **Workload Profiles** (wasm-component/container/serverless/VM) | ✅ | [27](../../docs/design/27-drivers-packs-profiles.md) |
| Rollback / incremental deploys | Event-sourced rollback + incremental reconcile | ✅ | [26](../../docs/design/26-environments-deltas.md), [04](../../docs/design/04-control-plane.md) |

## Platform & operations
| Humanitec | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Portal (golden paths, catalogs, scorecards) | HoBo dashboard + resource-graph/matching/delta/pipeline views | ✅ | [07](../../docs/design/07-ui-dashboard.md) |
| Agent (private-network reverse tunnel) | **HoBo Agent** (outbound-only; Executors run behind it) | ✅ | [28](../../docs/design/28-agent-gitops-pipelines.md), [12](../../docs/design/12-security-multitenancy.md), [13](../../docs/design/13-networking-connectivity.md) |
| Operator (secret provisioning) | Provider `secrets` port + brokered tokens | ✅ | [06](../../docs/design/06-ai-native-agent-auth.md), [12](../../docs/design/12-security-multitenancy.md) |
| Pipelines (triggers + approval gates) | **Pipelines** atop sagas + policy gates | ✅ | [28](../../docs/design/28-agent-gitops-pipelines.md), [05](../../docs/design/05-reliability-ha.md) |
| GitOps mode (write CRs to Git) | **GitOps publisher** target | ✅ | [28](../../docs/design/28-agent-gitops-pipelines.md), [22](../../docs/design/22-wiring-manifest.md) |
| Resource Packs | **Resource Packs** in the Registry (Forge-generatable) | ➕ | [27](../../docs/design/27-drivers-packs-profiles.md), [06](../../docs/design/06-ai-native-agent-auth.md) |
| RBAC + approvals | ABAC + policy gates | ✅ | [12](../../docs/design/12-security-multitenancy.md), [06](../../docs/design/06-ai-native-agent-auth.md) |
| Audit logs (365d, immutable) | Event log **is** the audit log (replayable) | ➕ | [11](../../docs/design/11-event-model.md), [14](../../docs/design/14-observability.md) |
| Drift detection | Drift loop (heal/propose/ignore) | ✅ | [05](../../docs/design/05-reliability-ha.md) |
| CI/CD integration | CLI/MCP + Pipelines + artifact triggers | ✅ | [15](../../docs/design/15-cli-dx.md), [28](../../docs/design/28-agent-gitops-pipelines.md) |
| MCP (AI agents drive it) | `@hobo/mcp` (agents as first-class principals) | ➕ | [06](../../docs/design/06-ai-native-agent-auth.md) |
| Self-hosted + air-gapped | Self-host = hosted (the Yard is a Bindle) + Agent | ✅ | [04](../../docs/design/04-control-plane.md) |
| IDP "5-plane" framing | HoBo = Integration & Delivery plane orchestrator | ✅ | [00](../../docs/design/00-vision.md), [17](../../docs/design/17-positioning-competitive.md) |

## Where HoBo deliberately exceeds Humanitec
| Capability | HoBo doc |
|---|---|
| **Auditable matching** (`match.Decided` events — "why this infra", replayable) | [25](../../docs/design/25-resource-definitions-matching.md), [11](../../docs/design/11-event-model.md) |
| **WASM-first polyglot runtime** (not K8s-centric) | [20](../../docs/design/20-wasm-wasi-runtime.md) |
| **Event-sourced replay/time-travel + DR-as-replay** | [11](../../docs/design/11-event-model.md), [05](../../docs/design/05-reliability-ha.md) |
| **Forge-generated Resource Definitions, Packs & implementations** (not human-only) | [23](../../docs/design/23-stubbable-ai-implementations.md), [06](../../docs/design/06-ai-native-agent-auth.md) |
| **IfC-default simplicity** + mapping-as-sugar (lower learning curve) | [02](../../docs/design/02-sdk-api.md), [25](../../docs/design/25-resource-definitions-matching.md) |
| **OSS core + WIT-standard ports** (less lock-in) | [17](../../docs/design/17-positioning-competitive.md), [24](../../docs/design/24-wit-worlds-reference.md) |

## Open parity items (iteration hooks)
- Resource Definition authoring surface: TS (typed) vs YAML (Humanitec-parity) vs both.
- Whether `echo`/BYO resources participate in drift/reconcile or are read-only.
- Agent transport + multi-cluster routing details.
- Matching scoring exactly mirroring Humanitec vs a HoBo refinement (explicit priorities).
