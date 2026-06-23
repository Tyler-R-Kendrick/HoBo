# Dapr → HoBo mapping

> Part of the [Dapr reference](./README.md). HoBo's equivalent for each Dapr concept (✅ has · ➕ goes further · 🔜 planned), and where the two architectures diverge.

| Dapr concept | HoBo equivalent | Notes |
|---|---|---|
| **Building block** (portable HTTP/gRPC API) | **WIT port** ([Plan 20](../../docs/design/20-wasm-wasi-runtime.md)/[Plan 24](../../docs/design/24-wit-interfaces-reference.md)) | ✅ same idea; HoBo's contract is a WIT interface (typed, conformance-tested) rather than an HTTP/gRPC convention |
| **Component** (swappable adapter + YAML) | **Capability provider + link** ([Plan 3](../../docs/design/03-providers-iac.md)/[Plan 20](../../docs/design/20-wasm-wasi-runtime.md)) | ✅ swap-without-code-change; HoBo links are late-bound + capability-scoped by `.allow()` |
| **Sidecar** (per-app runtime) | **`component-host`** (in-process wasm) ([ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031)) | ➕ no per-app sidecar tax; wasm-in-container default, runs anywhere a container runs |
| **State / pub/sub / bindings / actors / workflow / secrets / config / lock / crypto / jobs** | the matching HoBo ports/primitives ([building-blocks.md](./building-blocks.md) table) | ✅ near 1:1 — validates HoBo's port catalog |
| **Conversation** (LLM API) | `agent()` + `"use training"` + training-engine ([Plan 23](../../docs/design/23-stubbable-ai-implementations.md)/[ADR-0025](../../docs/design/adr/06-ai-generation-operators.md#adr-0025)) | ➕ HoBo treats AI as trainable semantic functions + durable agents-as-principals, not just an LLM call |
| **mTLS via SPIFFE-style identity** | SVID identity + brokered tokens ([Plan 6](../../docs/design/06-ai-native-agent-auth.md)/[Plan 13](../../docs/design/13-networking-connectivity.md)) | ✅ same SPIFFE lineage; HoBo extends it to agents + end-users as one PrincipalRef ([ADR-0038](../../docs/design/adr/02-identity-security.md#adr-0038)) |
| **Name resolution** (mDNS/K8s/Consul) | identity-based service discovery ([Plan 13](../../docs/design/13-networking-connectivity.md)) | ✅ HoBo discovers by SVID/logical name across providers |
| **Component YAML** | `.allow()` declaration → IAM + link + token (one decl, three effects) ([Plan 21](../../docs/design/21-resources-catalog.md)) | ➕ HoBo unifies grant + wiring + provisioning in one place |
| **Self-host / Kubernetes** | self-hostable Yard; K8s is *one* execution adapter, not the foundation ([ADR-0001](../../docs/design/adr/README.md)) | ➕ HoBo isn't K8s-centric in prod |
| *(none — Dapr doesn't provision)* | **Provisioning / IfC**: `realize()` + Planner + IaC adapters ([Plan 3](../../docs/design/03-providers-iac.md)/[Plan 22](../../docs/design/22-wiring-manifest.md)) | ➕ HoBo *creates* the infra, not just uses it |
| *(none)* | **Control-plane planes**: cost ([Plan 16](../../docs/design/16-cost-finops.md)), policy/`can-deploy` ([Plan 29](../../docs/design/29-contracts-compatibility.md)/[Plan 30](../../docs/design/30-policy-plane.md)), matching/Resource-Definitions ([Plan 25](../../docs/design/25-resource-definitions-matching.md)) | ➕ governance HoBo makes first-class |
| *(none)* | **Event-sourced infra + credential audit** ([Plan 11](../../docs/design/11-event-model.md)) | ➕ replay/time-travel/"why" for every infra + token change |
| *(hand-written components)* | **Forge** — AI-generated, conformance-gated adapters ([Plan 33](../../docs/design/33-forge-generation-pipeline.md)) | ➕ adapter breadth without a community bottleneck |

## The one-line takeaway
**Dapr ≈ HoBo's runtime ports + capability providers, made concrete at the sidecar layer — and nothing above it.** HoBo's whole differentiation is the layers Dapr leaves out: provisioning (IfC), the agnostic control plane with cost/policy/contracts/matching, event-sourced audit, agents/end-users as first-class principals, and AI-generated adapters. The closeness of the *runtime* mapping is the strongest external validation that HoBo's ports/adapters foundation is the right one.

## Could Dapr compose with HoBo?
Plausibly: a `Camp` could offer a **Dapr-backed runtime adapter** (realize HoBo ports onto Dapr building blocks where a team already runs Dapr), and Dapr's component catalog is a useful reference corpus for **Forge-generated** HoBo capability providers. Tracked as an idea, not a committed integration.
