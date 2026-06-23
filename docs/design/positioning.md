# Positioning & Competitive Analysis

This capability doc consolidates Plan 17 of the HoBo design suite.

## Plan 17

**Plan 17 — Positioning & competitive analysis**

### The one-line position
**HoBo is an AI-native meta-cloud — a cloud-agnostic *control plane* and durable runtime that maps a single app description onto any mix of real providers — agnostic by default, optimizable on demand, and operable by agents end to end.** The programmable surface is **WIT/WASM** (the Component Model / wasmCloud); **TypeScript is the first reference implementation, not a requirement** — any Component-Model language can author against the same WIT worlds ([ADR-0069](./adr/01-architecture-core.md#adr-0069)). It competes head-on with **Convex, Lakebed, and Nitric**; it is not a single PaaS, not "just IaC," and not Kubernetes-only.

### The landscape (and the gap HoBo fills)
| Product | Category | Cloud-agnostic? | Escape hatch | Runtime model | Agent/AI-native? | Self-host? |
|---|---|---|---|---|---|---|
| **Lakebed** | Agent-native PaaS | ❌ (own runtime) | endpoints/env only | sync RPC | reads contracts; basic auth | ❌ |
| **Vercel + Workflow SDK** | PaaS + durable exec | partial (runtime ports) | Vercel-native | durable workflows/steps | DurableAgent | runtime self-host |
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
| **HoBo** | **AI-native control plane** | **✅** | **typed `.with(...)` + WIT links** | **wasm components + actors + durable workflows + sagas (event-sourced)** | **agents as principals; Capability Manifest; Forge (providers+impls); MCP** | **✅ (the Yard is a Bindle)** |

**The gap:** every cloud-agnostic option above is either (a) IaC-flavored (you still think in infra), (b) Kubernetes-bound, or (c) not AI-native — and the wasm runtimes (wasmCloud/Spin) and orchestrators (Aspire) solve *runtime/wiring* but not multi-cloud provisioning, agents, or durable workflows. Every AI-native option (Lakebed, Vercel) is single-runtime / locked-in. **No one combines cloud-agnostic ports/adapters (as WIT interfaces) + a wasm-default polyglot runtime + a Vercel-grade durable runtime + Nitric-style IfC/`.allow()` + Aspire-style wiring + agents-as-first-class + AI-generated providers AND implementations + a self-hostable control plane.** That intersection is HoBo. (Detailed Nitric capture + parity in [`competitors/nitric`](../../competitors/nitric.md).)

### What HoBo borrows (deliberately)
- **From Vercel Workflows:** the durable `workflow`/`step` feel and the **runtime** ports/adapters for the runtime.
- **From Lakebed:** ruthless onboarding, machine-readable contracts (`llms.txt`), server authority — and we extend "machine-readable" from the app to *operations* (MCP).
- **From Crossplane/Radius:** reconciliation + the dev-vs-platform separation (here: `bindle.ts` vs `hobo.config.ts`, and provider recipes/equivalence classes).
- **From Pulumi:** real-language IaC via the Automation API as our primary mechanism.
- **From SPIFFE/OAuth/MCP-auth:** keyless workload identity + token brokering for agents.
- **From Nitric:** the full resource catalog, inline `.allow()` → least-privilege, and Infrastructure-from-Code (default authoring) — see [Plan 21](./authoring-resources-wiring.md#plan-21).
- **From WASI/Component Model + wasmCloud:** ports as **WIT interfaces**, providers as **capability providers**, `bind` as **links**, and a polyglot wasm-default runtime — see [Plan 20](./wasm-runtime-wit.md#plan-20).
- **From .NET Aspire:** `WithReference` wiring, uniform config for any component/container, annotations, and the **manifest IR** — see [Plan 22](./authoring-resources-wiring.md#plan-22). Detailed capture + parity in [`competitors/aspire`](../../competitors/aspire.md).
- **From Humanitec:** **Resource Definitions + Matching** (dynamic configuration management — the platform-rules layer, [Plan 25](./platform-engineering.md#plan-25)), the **Driver** taxonomy + Resource Packs + Workload Profiles ([Plan 27](./platform-engineering.md#plan-27)), **Deployment Sets/Deltas** + environment types/cloning/ephemeral ([Plan 26](./platform-engineering.md#plan-26)), the **Agent**/GitOps/**Pipelines** ([Plan 28](./platform-engineering.md#plan-28)), and the IDP **5-plane** framing (HoBo = the Integration & Delivery plane orchestrator). HoBo's edges: auditable matching (`match.Decided`), wasm-first, event-sourced replay, Forge-generated definitions, OSS core — see [`competitors/humanitec`](../../competitors/humanitec.md).

> **The head-on competitor set:** as an **AI-native meta-cloud**, HoBo competes directly with **Convex, Lakebed, and Nitric** — Convex (a reactive TypeScript backend-as-a-service whose end-to-end codegen + Management/OAuth API corroborate HoBo's generated-clients ([Plan 24](./wasm-runtime-wit.md#plan-24)) and control-plane/provisioning APIs ([Plan 4](./control-plane.md#plan-04)), and which HoBo could also *target as a `database`/backend capability provider* ([`competitors/convex`](../../competitors/convex.md))), Lakebed (agent-native PaaS, above), and Nitric (cloud-agnostic IfC framework, above). HoBo's edge over all three is the agnostic-ports + durable event-sourced runtime + agents/Forge intersection.
>
> **Adjacent products (not head-on competitors), captured for reference:** **shoo.dev** — a zero-config Google-sign-in broker (PKCE + ES256/JWKS) that composes with HoBo's identity model for *end-user* auth, orthogonal to HoBo's *workload/agent* identity ([Plan 6](./ai-native-agent-auth.md#plan-06), [`competitors/shoo`](../../competitors/shoo.md)).

### Defensible differentiators (the moat)
1. **AI-native operations, not just AI-readable apps** — agents deploy, optimize, and self-heal via MCP with first-class identity + audit.
2. **Capability Manifest standard + Registry** — a network effect: providers self-describe capabilities/auth, agents self-provision, and the **Forge** auto-generates missing providers (no community bottleneck).
3. **Event-sourced everything** — replay/time-travel/audit across both control and data planes is a property competitors would have to re-architect to match.
4. **Genuine agnostic + escape hatch in one model** — the same Bindle ships to one provider or many, with typed provider-specific optimization that doesn't fork the code.
5. **Contracts, policy & evals are native graph artifacts, not bolted-on tools** — consumer-driven compatibility (`can-deploy`, [Plan 29](./contracts-policy-flags.md#plan-29)), a unified policy plane with obligations ([Plan 30](./contracts-policy-flags.md#plan-30)), and eval-gated promotion ([Plan 23](./forge-generated-stack.md#plan-23)) compose into one `hobo verify`. The four-lens taxonomy (**Contract / Eval / Policy / Trace**) is built in, and **engines sit behind ports** — Pact/OPA/Cedar are *optional adapters*, never the conceptual model or a dependency.
6. **Incremental, not greenfield-only** — `hobo import` adopts an existing Terraform/Pulumi/Lakebed/FaaS estate **in place** and coexists with un-migrated infra (strangler-fig), so teams move onto HoBo without a big-bang rewrite ([ADR-0041](./adr/07-portability-extensibility.md#adr-0041)) — a path Lakebed's closed runtime doesn't offer.
7. **A built-in operator workforce (the Crew)** — SRE / Endpoint Monitor / GitOps / Platform Engineer ship as **autonomous, audited, policy-gated Yard services** ([Plan 40](./operators-sre.md#plan-40)), not a DIY agent kit; competitors expose APIs, HoBo ships the operators that drive them.
8. **A generated, self-healing stack — infrastructure and app/UI** — HoBo generates/self-heals/persists across **data·business·message·intelligence·UI** ([Plan 41](./forge-generated-stack.md#plan-41)) via **Forge-generated adapters** (providers/implementations behind ports), **self-optimizing runtime functions** (`"use training"`), and **design.md-driven UI generation** (OpenUI/json-render/mcp-apps behind the `ui-render` port) bound to the typed reactive data plane ([ADR-0056](./adr/06-ai-generation-operators.md#adr-0056)).
9. **Patchable, not just portable** — beyond "same app, N clouds," you can derive your own HoBo (swap any engine, fork the Yard) and persist AI/human patches, with conformance as the trust bridge ([Plan 43](./forge-generated-stack.md#plan-43)/[ADR-0057](./adr/07-portability-extensibility.md#adr-0057)) — closed PaaS offers neither guarantee.
10. **Nitric's building blocks, on the Component Model** — HoBo matches Nitric's runtime building-block set (apis, kv, buckets, queues, topics, secrets, sql, schedules, websockets, jobs) but realizes each as a **WIT interface**, so **providers code against WIT** (not per-language Go plugins; Forge-generatable) and the membrane is **wRPC** — wasmCloud's WIT-native RPC, generated from the same WIT — instead of plain gRPC. A **thin SDK** is typed sugar over the runtime with no cloud logic, deny-by-default falls out of linking, and one contract drives local/cross-process/lattice ([ADR-0069](./adr/01-architecture-core.md#adr-0069)). DX edge: `hobo dev` auth is a **contract-satisfied fixture** — the bypass cannot drift from prod because the same `auth` contract gates deploy ([ADR-0070](./adr/02-identity-security.md#adr-0070)).

### Who HoBo is NOT for (honest scoping)
- Teams happy on a single cloud with deep native tooling and no agnostic need (SST/CDK is simpler).
- Pure-Kubernetes shops already invested in Crossplane/KubeVela (HoBo can sit on top, but it's not k8s-first).
- Apps that need bare-metal/extreme-perf control where any abstraction is a liability.

### Key risks (and how the design hedges)
- **Lowest-common-denominator trap** → mitigated by the `.with(...)` escape hatch + `require`/`prefer` so power is never out of reach.
- **Abstraction leakage / debugging across providers** → mitigated by event-sourced replay + the topology/cost graph showing exactly where things landed.
- **Provider breadth is a treadmill** → mitigated by the Forge + conformance suite (AI generates, contracts certify).
- **Trusting AI-generated infra code** → mitigated by sandboxed conformance + signed provenance ([Plan 12](./security-networking.md#plan-12)).
- **"Yet another abstraction" skepticism** → mitigated by matching Lakebed's onboarding and letting users drop to provider-native instantly.

### Iteration hooks
- Sharpen the primary ICP (indie/agent-builders first vs platform teams first) — changes default UX emphasis.
- Whether to lead with "AI-native" or "cloud-agnostic" in messaging.
- OSS core + hosted Yard split (what's free, what's paid) — ties to [Plan 0](./vision.md#plan-00) governance.
