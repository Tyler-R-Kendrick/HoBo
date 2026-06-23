# Aspire → HoBo parity & mapping tracker

> For every Aspire feature, the HoBo equivalent and the design doc that owns it. ✅ = designed at parity · ➕ = HoBo goes further · 🔜 = planned. HoBo design lives in [`../../docs/design/`](../../docs/design/README.md). Aspire directly inspired HoBo's wiring/manifest layer, so parity here is high by design.

## Composition & wiring
| Aspire | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| AppHost (`DistributedApplication.CreateBuilder`) | `bindle()` topology + **IfC** resource collection | ✅ | [02](../../docs/design/sdk-api.md#plan-02), [21](../../docs/design/authoring-resources-wiring.md#plan-21) |
| `IResource` + capability interfaces | Resources behind **WIT-interface ports** + capability negotiation | ➕ | [20](../../docs/design/wasm-runtime-wit.md#plan-20), [24](../../docs/design/wasm-runtime-wit.md#plan-24) |
| `Add*` integration catalog | Resource catalog + capability providers | ✅ | [21](../../docs/design/authoring-resources-wiring.md#plan-21), [03](../../docs/design/control-plane.md#plan-03) |
| Hosting vs **client** integrations | Provider `realize` (deploy) vs generated typed clients (`code`) | ✅ | [03](../../docs/design/control-plane.md#plan-03), [02](../../docs/design/sdk-api.md#plan-02) |
| `WithReference` / `services__*` / `ConnectionStrings__*` | Aspire-style references + the same env conventions | ✅ | [22](../../docs/design/authoring-resources-wiring.md#plan-22) |
| `ReferenceExpression` / `EndpointReference` / placeholders | Lazy refs + `${resources..outputs}` placeholders | ✅ | [22](../../docs/design/authoring-resources-wiring.md#plan-22), [27](../../docs/design/platform-engineering.md#plan-27) |
| `WaitFor` / `WaitForCompletion` (health-gated) | Saga ordering + readiness gates in the deploy DAG | ✅ | [04](../../docs/design/control-plane.md#plan-04), [05](../../docs/design/reliability-observability-cost.md#plan-05) |
| Endpoints / proxy / `WithExternalHttpEndpoints` | Endpoint model + ingress in the manifest | ✅ | [22](../../docs/design/authoring-resources-wiring.md#plan-22), [13](../../docs/design/security-networking.md#plan-13) |
| Annotations (`IResourceAnnotation`) | Manifest annotations / extensibility metadata | ✅ | [22](../../docs/design/authoring-resources-wiring.md#plan-22) |
| Custom resources/integrations | Custom providers (any wasm language) + Forge-generated | ➕ | [03](../../docs/design/control-plane.md#plan-03), [23](../../docs/design/forge-generated-stack.md#plan-23) |
| Parameters & secrets | Parameters + brokered secrets (`secrets` port) | ✅ | [02](../../docs/design/sdk-api.md#plan-02), [12](../../docs/design/security-networking.md#plan-12) |

## Runtime, deploy & ops
| Aspire | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| `aspire-manifest.json` (deploy IR) | **manifest IR = Deployment Set** | ✅➕ | [22](../../docs/design/authoring-resources-wiring.md#plan-22), [26](../../docs/design/platform-engineering.md#plan-26) |
| Publishers (azd/Compose/K8s/custom) | Publisher targets incl. **GitOps publisher** | ✅ | [22](../../docs/design/authoring-resources-wiring.md#plan-22), [28](../../docs/design/platform-engineering.md#plan-28) |
| Compute environments | Camps + **environment types** | ✅ | [26](../../docs/design/platform-engineering.md#plan-26) |
| DCP (local Go orchestrator) | local `runtime-local` host / dev loop; the Yard for hosted | ✅ | [20](../../docs/design/wasm-runtime-wit.md#plan-20), [04](../../docs/design/control-plane.md#plan-04) |
| Aspire Dashboard (resource graph, OTel) | Dashboard: resource graph + run inspector + replay | ➕ | [07](../../docs/design/developer-experience.md#plan-07), [14](../../docs/design/reliability-observability-cost.md#plan-14) |
| OpenTelemetry-by-default | OTel + event-sourced traces/replay | ➕ | [14](../../docs/design/reliability-observability-cost.md#plan-14), [11](../../docs/design/event-model.md#plan-11) |
| `Aspire.Hosting.Testing` | Conformance suites + E2E replay tests | ✅ | [09](../../docs/design/verification.md#plan-09) |
| `aspire` CLI | `hobo` CLI | ✅ | [15](../../docs/design/developer-experience.md#plan-15) |
| Polyglot (Python/Node/Go/Java/Rust) | **WASM/WASI components** (any language) + OCI fallback | ➕ | [20](../../docs/design/wasm-runtime-wit.md#plan-20) |
| AI integrations + Copilot-in-dashboard | Agents as principals + MCP + Forge generation | ➕ | [06](../../docs/design/ai-native-agent-auth.md#plan-06), [23](../../docs/design/forge-generated-stack.md#plan-23) |

## Where HoBo deliberately exceeds Aspire
| Capability | HoBo doc |
|---|---|
| **Platform-rules / Matching** (per-environment Resource Definitions — Aspire has no equivalent) | [25](../../docs/design/platform-engineering.md#plan-25) |
| **Hosted, multi-tenant, governed control plane** (RBAC/policy/approvals/cost) | [04](../../docs/design/control-plane.md#plan-04), [12](../../docs/design/security-networking.md#plan-12), [16](../../docs/design/reliability-observability-cost.md#plan-16) |
| **Event-sourced replay / time-travel / DR-as-replay** | [11](../../docs/design/event-model.md#plan-11), [05](../../docs/design/reliability-observability-cost.md#plan-05) |
| **WASM-first polyglot runtime** (vs container/process) | [20](../../docs/design/wasm-runtime-wit.md#plan-20) |
| **Agent-native Forge** generation of providers/implementations/definitions | [06](../../docs/design/ai-native-agent-auth.md#plan-06), [23](../../docs/design/forge-generated-stack.md#plan-23) |
| **Stubbable ports** (run before implementations exist) | [23](../../docs/design/forge-generated-stack.md#plan-23) |

## What HoBo borrows wholesale (credit Aspire)
`WithReference`-style wiring, uniform config for any component/container, annotations as extensibility, and the **manifest as deploy IR** — adopted in [Plan 22](../../docs/design/authoring-resources-wiring.md#plan-22). HoBo's contribution is wrapping that ergonomic core in a wasm runtime, a matching/platform layer, event-sourcing, and a governed hosted plane.
