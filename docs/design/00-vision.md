# Plan 0 — Vision, positioning & guiding principles

> Part of the [HoBo Design Plan Suite](./README.md).

> **v3 (Humanitec):** HoBo embraces the Internal Developer Platform **"5-plane"** framing — it is the **Integration & Delivery plane orchestrator** — and the **developer-vs-platform-engineer separation of concerns**: developers declare *what* (IfC resources), platform engineers declare *how* via **Resource Definitions** matched per environment ([Plan 25](./25-resource-definitions-matching.md)). "Agnostic by default, optimizable on demand" now also means "simple for developers, governable by platform teams."

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

## Non-goals (initially)
- Being a general PaaS UI for non-developers.
- Replacing Terraform/Pulumi (we *orchestrate* them).
- Supporting every cloud on day one.

## Iteration hooks
- Tagline/naming.
- Exact PaaS/SaaS/CaaS/IaaS taxonomy boundaries.
- OSS license & governance.
- Hosted business model.
