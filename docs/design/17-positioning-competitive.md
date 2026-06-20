# Plan 17 — Positioning & competitive analysis

> Part of the [HoBo Design Plan Suite](./README.md). Where HoBo sits in a crowded space, and why it's defensible.

## The one-line position
**HoBo is an AI-native, cloud-agnostic *control plane* that maps a single TypeScript app description onto any mix of real providers — agnostic by default, optimizable on demand, and operable by agents end to end.** It is not a single PaaS, not "just IaC," and not Kubernetes-only.

## The landscape (and the gap HoBo fills)
| Product | Category | Cloud-agnostic? | Escape hatch | Runtime model | Agent/AI-native? | Self-host? |
|---|---|---|---|---|---|---|
| **Lakebed** | Agent-native PaaS | ❌ (own runtime) | endpoints/env only | sync RPC | reads contracts; basic auth | ❌ |
| **Vercel + Workflow SDK** | PaaS + durable exec | partial (Worlds for runtime) | Vercel-native | durable workflows/steps | DurableAgent | Worlds self-host |
| **SST** | AWS framework | ❌ (AWS) | full CDK | serverless | no | n/a |
| **Encore** | Backend framework | ✅ (AWS/GCP) | config overrides | typed services | no | ✅ |
| **Nitric** | Cloud-agnostic framework (IfC) | ✅ | plugin/custom provider (Go) | functions/resources | no | ✅ |
| **Wing** | Cloud language | ✅ | `bring` modules | preflight/inflight | no | ✅ |
| **Pulumi** | IaC SDK | ✅ | full SDK | n/a (provisioning) | no | ✅ |
| **Crossplane** | K8s control plane | ✅ | compositions | reconcilers (CRDs) | no | ✅ (k8s) |
| **Radius** | App platform | ✅ | recipes | app model | no | ✅ |
| **Humanitec** | Platform Orchestrator (IDP) | ✅ | Resource Definitions + drivers | k8s-centric (v2 any-compute) | MCP (2026) | ✅ (self-host) |
| **Score / KubeVela / OAM** | Workload spec | ✅ | traits/policies | k8s-centric | no | ✅ |
| **wasmCloud** | Wasm actor/provider runtime | ✅ | capability providers + links | components + providers | no | ✅ |
| **Fermyon Spin / SpinKube** | Wasm serverless | ✅ (wasm) | spin triggers/components | wasm components | no | ✅ |
| **.NET Aspire** | App composition/orchestration | partial | annotations / custom resources | containers + projects | no | ✅ |
| **HoBo** | **AI-native control plane** | **✅** | **typed `.with(...)` + WIT links** | **wasm components + actors + durable workflows + sagas (event-sourced)** | **agents as principals; Hobo Code; Forge (providers+impls); MCP** | **✅ (the Yard is a Bindle)** |

**The gap:** every cloud-agnostic option above is either (a) IaC-flavored (you still think in infra), (b) Kubernetes-bound, or (c) not AI-native — and the wasm runtimes (wasmCloud/Spin) and orchestrators (Aspire) solve *runtime/wiring* but not multi-cloud provisioning, agents, or durable workflows. Every AI-native option (Lakebed, Vercel) is single-runtime / locked-in. **No one combines cloud-agnostic ports/adapters (as WIT worlds) + a wasm-default polyglot runtime + a Vercel-grade durable runtime + Nitric-style IfC/`.allow()` + Aspire-style wiring + agents-as-first-class + AI-generated providers AND implementations + a self-hostable control plane.** That intersection is HoBo. (Detailed Nitric capture + parity in [`competitors/nitric`](../../competitors/nitric/README.md).)

## What HoBo borrows (deliberately)
- **From Vercel Workflows:** the durable `workflow`/`step` feel and the **Worlds** ports/adapters for the runtime.
- **From Lakebed:** ruthless onboarding, machine-readable contracts (`llms.txt`), server authority — and we extend "machine-readable" from the app to *operations* (MCP).
- **From Crossplane/Radius:** reconciliation + the dev-vs-platform separation (here: `bindle.ts` vs `hobo.config.ts`, and provider recipes/equivalence classes).
- **From Pulumi:** real-language IaC via the Automation API as our primary mechanism.
- **From SPIFFE/OAuth/MCP-auth:** keyless workload identity + token brokering for agents.
- **From Nitric:** the full resource catalog, inline `.allow()` → least-privilege, and Infrastructure-from-Code (default authoring) — see [Plan 21](./21-resources-catalog.md).
- **From WASI/Component Model + wasmCloud:** ports as **WIT worlds**, providers as **capability providers**, `bind` as **links**, and a polyglot wasm-default runtime — see [Plan 20](./20-wasm-wasi-runtime.md).
- **From .NET Aspire:** `WithReference` wiring, uniform config for any component/container, annotations, and the **manifest IR** — see [Plan 22](./22-wiring-manifest.md). Detailed capture + parity in [`competitors/aspire`](../../competitors/aspire/README.md).
- **From Humanitec:** **Resource Definitions + Matching** (dynamic configuration management — the platform-rules layer, [Plan 25](./25-resource-definitions-matching.md)), the **Driver** taxonomy + Resource Packs + Workload Profiles ([Plan 27](./27-drivers-packs-profiles.md)), **Deployment Sets/Deltas** + environment types/cloning/ephemeral ([Plan 26](./26-environments-deltas.md)), the **Agent**/GitOps/**Pipelines** ([Plan 28](./28-agent-gitops-pipelines.md)), and the IDP **5-plane** framing (HoBo = the Integration & Delivery plane orchestrator). HoBo's edges: auditable matching (`match.Decided`), wasm-first, event-sourced replay, Forge-generated definitions, OSS core — see [`competitors/humanitec`](../../competitors/humanitec/README.md).

## Defensible differentiators (the moat)
1. **AI-native operations, not just AI-readable apps** — agents deploy, optimize, and self-heal via MCP with first-class identity + audit.
2. **Hobo Code standard + Registry** — a network effect: providers self-describe capabilities/auth, agents self-provision, and the **Forge** auto-generates missing providers (no community bottleneck).
3. **Event-sourced everything** — replay/time-travel/audit across both control and data planes is a property competitors would have to re-architect to match.
4. **Genuine agnostic + escape hatch in one model** — the same Bindle ships to one provider or many, with typed provider-specific optimization that doesn't fork the code.

## Who HoBo is NOT for (honest scoping)
- Teams happy on a single cloud with deep native tooling and no agnostic need (SST/CDK is simpler).
- Pure-Kubernetes shops already invested in Crossplane/KubeVela (HoBo can sit on top, but it's not k8s-first).
- Apps that need bare-metal/extreme-perf control where any abstraction is a liability.

## Key risks (and how the design hedges)
- **Lowest-common-denominator trap** → mitigated by the `.with(...)` escape hatch + `require`/`prefer` so power is never out of reach.
- **Abstraction leakage / debugging across providers** → mitigated by event-sourced replay + the topology/cost graph showing exactly where things landed.
- **Provider breadth is a treadmill** → mitigated by the Forge + conformance suite (AI generates, contracts certify).
- **Trusting AI-generated infra code** → mitigated by sandboxed conformance + signed provenance ([Plan 12](./12-security-multitenancy.md)).
- **"Yet another abstraction" skepticism** → mitigated by matching Lakebed's onboarding and letting users drop to provider-native instantly.

## Iteration hooks
- Sharpen the primary ICP (indie/agent-builders first vs platform teams first) — changes default UX emphasis.
- Whether to lead with "AI-native" or "cloud-agnostic" in messaging.
- OSS core + hosted Yard split (what's free, what's paid) — ties to [Plan 0](./00-vision.md) governance.
