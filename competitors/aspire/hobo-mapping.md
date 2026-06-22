# Aspire → HoBo parity & mapping tracker

> For every Aspire feature, the HoBo equivalent and the design doc that owns it. ✅ = designed at parity · ➕ = HoBo goes further · 🔜 = planned. HoBo design lives in [`../../docs/design/`](../../docs/design/README.md). Aspire directly inspired HoBo's wiring/manifest layer, so parity here is high by design.

## Composition & wiring
| Aspire | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| AppHost (`DistributedApplication.CreateBuilder`) | `bindle()` topology + **IfC** resource collection | ✅ | [02](../../docs/design/02-sdk-api.md), [21](../../docs/design/21-resources-catalog.md) |
| `IResource` + capability interfaces | Resources behind **WIT-interface ports** + capability negotiation | ➕ | [20](../../docs/design/20-wasm-wasi-runtime.md), [24](../../docs/design/24-wit-interfaces-reference.md) |
| `Add*` integration catalog | Resource catalog + capability providers | ✅ | [21](../../docs/design/21-resources-catalog.md), [03](../../docs/design/03-providers-iac.md) |
| Hosting vs **client** integrations | Provider `realize` (deploy) vs generated typed clients (`code`) | ✅ | [03](../../docs/design/03-providers-iac.md), [02](../../docs/design/02-sdk-api.md) |
| `WithReference` / `services__*` / `ConnectionStrings__*` | Aspire-style references + the same env conventions | ✅ | [22](../../docs/design/22-wiring-manifest.md) |
| `ReferenceExpression` / `EndpointReference` / placeholders | Lazy refs + `${resources..outputs}` placeholders | ✅ | [22](../../docs/design/22-wiring-manifest.md), [27](../../docs/design/27-drivers-packs-profiles.md) |
| `WaitFor` / `WaitForCompletion` (health-gated) | Saga ordering + readiness gates in the deploy DAG | ✅ | [04](../../docs/design/04-control-plane.md), [05](../../docs/design/05-reliability-ha.md) |
| Endpoints / proxy / `WithExternalHttpEndpoints` | Endpoint model + ingress in the manifest | ✅ | [22](../../docs/design/22-wiring-manifest.md), [13](../../docs/design/13-networking-connectivity.md) |
| Annotations (`IResourceAnnotation`) | Manifest annotations / extensibility metadata | ✅ | [22](../../docs/design/22-wiring-manifest.md) |
| Custom resources/integrations | Custom providers (any wasm language) + Forge-generated | ➕ | [03](../../docs/design/03-providers-iac.md), [23](../../docs/design/23-stubbable-ai-implementations.md) |
| Parameters & secrets | Parameters + brokered secrets (`secrets` port) | ✅ | [02](../../docs/design/02-sdk-api.md), [12](../../docs/design/12-security-multitenancy.md) |

## Runtime, deploy & ops
| Aspire | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| `aspire-manifest.json` (deploy IR) | **manifest IR = Deployment Set** | ✅➕ | [22](../../docs/design/22-wiring-manifest.md), [26](../../docs/design/26-environments-deltas.md) |
| Publishers (azd/Compose/K8s/custom) | Publisher targets incl. **GitOps publisher** | ✅ | [22](../../docs/design/22-wiring-manifest.md), [28](../../docs/design/28-relay-gitops-pipelines.md) |
| Compute environments | Camps + **environment types** | ✅ | [26](../../docs/design/26-environments-deltas.md) |
| DCP (local Go orchestrator) | local `runtime-local` host / dev loop; the Yard for hosted | ✅ | [20](../../docs/design/20-wasm-wasi-runtime.md), [04](../../docs/design/04-control-plane.md) |
| Aspire Dashboard (resource graph, OTel) | Dashboard: resource graph + run inspector + replay | ➕ | [07](../../docs/design/07-ui-dashboard.md), [14](../../docs/design/14-observability.md) |
| OpenTelemetry-by-default | OTel + event-sourced traces/replay | ➕ | [14](../../docs/design/14-observability.md), [11](../../docs/design/11-event-model.md) |
| `Aspire.Hosting.Testing` | Conformance suites + E2E replay tests | ✅ | [09](../../docs/design/09-verification-open-questions.md) |
| `aspire` CLI | `hobo` CLI | ✅ | [15](../../docs/design/15-cli-dx.md) |
| Polyglot (Python/Node/Go/Java/Rust) | **WASM/WASI components** (any language) + OCI fallback | ➕ | [20](../../docs/design/20-wasm-wasi-runtime.md) |
| AI integrations + Copilot-in-dashboard | Agents as principals + MCP + Forge generation | ➕ | [06](../../docs/design/06-ai-native-agent-auth.md), [23](../../docs/design/23-stubbable-ai-implementations.md) |

## Where HoBo deliberately exceeds Aspire
| Capability | HoBo doc |
|---|---|
| **Platform-rules / Matching** (per-environment Resource Definitions — Aspire has no equivalent) | [25](../../docs/design/25-resource-definitions-matching.md) |
| **Hosted, multi-tenant, governed control plane** (RBAC/policy/approvals/cost) | [04](../../docs/design/04-control-plane.md), [12](../../docs/design/12-security-multitenancy.md), [16](../../docs/design/16-cost-finops.md) |
| **Event-sourced replay / time-travel / DR-as-replay** | [11](../../docs/design/11-event-model.md), [05](../../docs/design/05-reliability-ha.md) |
| **WASM-first polyglot runtime** (vs container/process) | [20](../../docs/design/20-wasm-wasi-runtime.md) |
| **Agent-native Forge** generation of providers/implementations/definitions | [06](../../docs/design/06-ai-native-agent-auth.md), [23](../../docs/design/23-stubbable-ai-implementations.md) |
| **Stubbable ports** (run before implementations exist) | [23](../../docs/design/23-stubbable-ai-implementations.md) |

## What HoBo borrows wholesale (credit Aspire)
`WithReference`-style wiring, uniform config for any component/container, annotations as extensibility, and the **manifest as deploy IR** — adopted in [Plan 22](../../docs/design/22-wiring-manifest.md). HoBo's contribution is wrapping that ergonomic core in a wasm runtime, a matching/platform layer, event-sourcing, and a governed hosted plane.
