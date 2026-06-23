# Vision, Positioning & Guiding Principles

This capability doc consolidates Plan 0 of the HoBo design suite.

## Plan 00

**Plan 0 — Vision, positioning & guiding principles**

> **Platform-engineering framing (Humanitec parity):** HoBo embraces the Internal Developer Platform **"5-plane"** framing — it is the **Integration & Delivery plane orchestrator** — and the **developer-vs-platform-engineer separation of concerns**: developers declare *what* (IfC resources), platform engineers declare *how* via **Resource Definitions** matched per environment ([Plan 25](./platform-engineering.md#plan-25)). "Agnostic by default, optimizable on demand" now also means "simple for developers, governable by platform teams."

> **Sharpened goals.** HoBo is an **AI-native meta-cloud** — a meta cloud-orchestration layer that is **security-first**, **AI-native**, **platform-engineering & GitOps built-in**, and — beyond portability — **patchable**. It competes head-on with **Convex, Lakebed, and Nitric**. The AI-native promise is concrete: a built-in roster of **Operator Agents (the Crew)** runs the platform ([Plan 40](./operators-sre.md#plan-40)), and HoBo **generates, self-heals, and persists** the app — infrastructure and UI — across a five-layer **generated stack** — data · business · message · intelligence · UI ([Plan 23](./forge-generated-stack.md#plan-23)) — Forge-generated adapters/projections/handlers + self-optimizing trained methods + design.md-driven app UI ([ADR-0056](./adr/06-ai-generation-operators.md#adr-0056)). HoBo's cloud is **only the cross-cloud orchestration plane**; everything else runs on the user's chosen providers.

**Pitch:** *"Write your app once. HoBo — the AI-native meta-cloud — decides how to host it, and gets out of the way when you want control. Built for humans and the agents that work for them."* The programmable surface is **WIT/WASM** (the Component Model / wasmCloud); **TypeScript is the first reference implementation, not a requirement** — any Component-Model language authors against the same WIT worlds ([ADR-0069](./adr/01-architecture-core.md#adr-0069)).

### Principles (design north stars)
1. **Agnostic by default, optimizable on demand.** Provider-specific options are always a `.with(...)` away, never required.
2. **Everything is replayable.** Deployments, workflows, actor state, and *token issuance* are events in an append-only log → audit, recovery, and time-travel for free.
3. **Agents are users, not afterthoughts.** Every capability is reachable via SDK, CLI, **and** MCP, with first-class agent identity.
4. **Ports over platforms.** Cloud, IaC, and build/VM are all the same ports/adapters shape. New backends are adapters, ideally AI-generated.
5. **Self-host = hosted.** The Yard is itself a HoBo bindle (dogfood); the only difference is who runs it.
6. **Conformance is the contract.** Every port ships a contract test suite; any adapter (human- or AI-written) must pass it.
7. **Nested scopes.** `Junction` (cross-cloud / hybrid; connects Yards) ⊃ `Yard` (a **provider-specific** cross-Camp scope — one provider's cross-Camp policy + that provider's control plane) ⊃ `Camp` (a **provider-specific** target that also **provides the durable runtime**) ⊃ `Bindle` (the app's provider-agnostic config). HoBo defines its **own runtime ports** rather than adopting any vendor's runtime concept ([README glossary](./README.md#glossary--naming-thematic-all-tunable)).
8. **Secretless-first.** Config and secrets resolve to *references* (per Camp), not stored values; access prefers workload identity + brokered short-lived tokens over static secrets ([Plan 21](./authoring-resources-wiring.md#plan-21)).
9. **Patchable, not just portable.** Portability moves the *app* across backends ([ADR-0024](./adr/07-portability-extensibility.md#adr-0024)); **patchability** lets you change *HoBo itself* — swap any engine, add any adapter, fork the Yard, and persist AI/human patches — with conformance as the trust bridge ([Plan 23](./forge-generated-stack.md#plan-23)/[ADR-0057](./adr/07-portability-extensibility.md#adr-0057)).
10. **AI-native operations & generation.** Built-in **Operator Agents** (SRE/Endpoint Monitor/GitOps/Platform Engineer) run the platform ([Plan 40](./operators-sre.md#plan-40)); the **generated stack** ([Plan 23](./forge-generated-stack.md#plan-23)) generates/self-heals/persists the app (adapters/projections/handlers/trained methods + design.md-driven UI) across data·business·message·intelligence·UI — one loop, one trust boundary, one persistence mechanism ([ADR-0056](./adr/06-ai-generation-operators.md#adr-0056)).
11. **Security-first.** Agentic auth (SVID/OIDC, brokered short-lived tokens), policy gates at every phase, and **continuous/live security scanning + remediation** ([Plan 6](./ai-native-agent-auth.md#plan-06)/[Plan 12](./security-networking.md#plan-12)/[Plan 29](./contracts-policy-flags.md#plan-29)) — the SRE/security operator + OCSF audit close the loop.

### Configuration surfaces
- **Client-configurable** (per app/team): **IaC providers** ([Plan 4](./control-plane.md#plan-04)), **auth** ([Plan 6](./ai-native-agent-auth.md#plan-06)/[Plan 6](./ai-native-agent-auth.md#plan-06)), and **secrets / vars / config-as-a-service** ([Plan 21](./authoring-resources-wiring.md#plan-21)).
- **Cloud-configurable** (the orchestration plane): **trainable code** — model, evals, training data ([Plan 23](./forge-generated-stack.md#plan-23)/[ADR-0025](./adr/06-ai-generation-operators.md#adr-0025)) — and **cross-cloud integrations** (the Junction, [ADR-0043](./adr/07-portability-extensibility.md#adr-0043); cross-Camp state, [ADR-0040](./adr/05-config-matching-environments.md#adr-0040)).

### Non-goals (initially)
- Being a general PaaS UI for non-developers.
- Replacing Terraform/Pulumi (we *orchestrate* them).
- Supporting every cloud on day one.
- **SaaS-business functions** — billing, subscriptions, invoicing, tax/VAT, chargeback, monetization, rev-share. HoBo is not a payments/commerce product ([ADR-0064](./adr/08-scope-and-requirements.md#adr-0064)).

### Iteration hooks
- Tagline/naming.
- Exact PaaS/SaaS/CaaS/IaaS taxonomy boundaries.
- OSS license & governance.
- Hosted business model.
