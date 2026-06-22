# Plan 0 — Vision, positioning & guiding principles

> Part of the [HoBo Design Plan Suite](./README.md).

> **v3 (Humanitec):** HoBo embraces the Internal Developer Platform **"5-plane"** framing — it is the **Integration & Delivery plane orchestrator** — and the **developer-vs-platform-engineer separation of concerns**: developers declare *what* (IfC resources), platform engineers declare *how* via **Resource Definitions** matched per environment ([Plan 25](./25-resource-definitions-matching.md)). "Agnostic by default, optimizable on demand" now also means "simple for developers, governable by platform teams."

> **v4 (sharpened goals).** HoBo is a **meta cloud-orchestration layer** that is **security-first**, **AI-native**, **platform-engineering & GitOps built-in**, and — beyond portability — **patchable**. The AI-native promise is concrete: a built-in roster of **Operator Agents (the Crew)** runs the platform ([Plan 40](./40-operator-agents.md)), and HoBo **generates, self-heals, and persists** code across a five-layer **generated stack** — data · business · message · intelligence · **ui** ([Plan 41](./41-generated-stack.md)), including the app's front-end ([Plan 42](./42-ui-layer-generation.md)). HoBo's cloud is **only the cross-cloud orchestration plane**; everything else runs on the user's chosen providers.

**Pitch:** *"Write your app once in TypeScript. HoBo decides how to host it — and gets out of the way when you want control. Built for humans and the agents that work for them."*

## Principles (design north stars)
1. **Agnostic by default, optimizable on demand.** Provider-specific options are always a `.with(...)` away, never required.
2. **Everything is replayable.** Deployments, workflows, actor state, and *token issuance* are events in an append-only log → audit, recovery, and time-travel for free.
3. **Agents are users, not afterthoughts.** Every capability is reachable via SDK, CLI, **and** MCP, with first-class agent identity.
4. **Ports over platforms.** Cloud, IaC, and build/VM are all the same ports/adapters shape. New backends are adapters, ideally AI-generated.
5. **Self-host = hosted.** The Yard is itself a HoBo bindle (dogfood); the only difference is who runs it.
6. **Conformance is the contract.** Every port ships a contract test suite; any adapter (human- or AI-written) must pass it.
7. **Three nested scopes.** `Yard` (cross-provider / cross-cloud / hybrid policy + the control plane) ⊃ `Camp` (a **provider-specific** target that also **provides the durable runtime**) ⊃ `Bindle` (the app's provider-agnostic config). HoBo defines its **own runtime ports** rather than adopting any vendor's runtime concept ([README glossary](./README.md#glossary--naming-thematic-all-tunable)).
8. **Secretless-first.** Config and secrets resolve to *references* (per Camp), not stored values; access prefers workload identity + brokered short-lived tokens over static secrets ([Plan 31](./31-config-secretless-secrets.md)).
9. **Patchable, not just portable.** Portability moves the *app* across backends ([ADR-0024](./adr/ADR-0024-portability-conformance-guarantee.md)); **patchability** lets you change *HoBo itself* — swap any engine, add any adapter, fork the Yard, and persist AI/human patches — with conformance as the trust bridge ([Plan 43](./43-patchability-extensibility.md)/[ADR-0057](./adr/ADR-0057-patchability-derivative-implementations.md)).
10. **AI-native operations & generation.** Built-in **Operator Agents** (SRE/Endpoint Monitor/GitOps/Platform Engineer/UX Designer) run the platform ([Plan 40](./40-operator-agents.md)); the **generated stack** ([Plan 41](./41-generated-stack.md)) generates/self-heals/persists code across data·business·message·intelligence·ui — one loop, one trust boundary, one persistence mechanism.
11. **Security-first.** Agentic auth (SVID/OIDC, brokered short-lived tokens), policy gates at every phase, and **continuous/live security scanning + remediation** ([Plan 6](./06-ai-native-agent-auth.md)/[Plan 12](./12-security-multitenancy.md)/[Plan 30](./30-policy-plane.md)) — the SRE/security operator + OCSF audit close the loop.

## Configuration surfaces
- **Client-configurable** (per app/team): **IaC providers** ([Plan 3](./03-providers-iac.md)), **auth** ([Plan 6](./06-ai-native-agent-auth.md)/[Plan 36](./36-end-user-auth.md)), and **secrets / vars / config-as-a-service** ([Plan 31](./31-config-secretless-secrets.md)).
- **Cloud-configurable** (the orchestration plane): **trainable code** — model, evals, training data ([Plan 23](./23-stubbable-ai-implementations.md)/[ADR-0025](./adr/ADR-0025-use-training-directive-and-training-engine.md)) — and **cross-cloud integrations** (the Junction, [ADR-0043](./adr/ADR-0043-multi-yard-federation-junction.md); cross-Camp state, [ADR-0040](./adr/ADR-0040-cross-camp-stateful-consistency.md)).

## Non-goals (initially)
- Being a general PaaS UI for non-developers.
- Replacing Terraform/Pulumi (we *orchestrate* them).
- Supporting every cloud on day one.

## Iteration hooks
- Tagline/naming.
- Exact PaaS/SaaS/CaaS/IaaS taxonomy boundaries.
- OSS license & governance.
- Hosted business model.
