# Plan 0 — Vision, positioning & guiding principles

> Part of the [HoBo Design Plan Suite](./README.md).

**Pitch:** *"Write your app once in TypeScript. HoBo decides how to host it — and gets out of the way when you want control. Built for humans and the agents that work for them."*

## Principles (design north stars)
1. **Agnostic by default, optimizable on demand.** Provider-specific options are always a `.with(...)` away, never required.
2. **Everything is replayable.** Deployments, workflows, actor state, and *token issuance* are events in an append-only log → audit, recovery, and time-travel for free.
3. **Agents are users, not afterthoughts.** Every capability is reachable via SDK, CLI, **and** MCP, with first-class agent identity.
4. **Ports over platforms.** Cloud, IaC, and build/VM are all the same ports/adapters shape. New backends are adapters, ideally AI-generated.
5. **Self-host = hosted.** The Yard is itself a HoBo bindle (dogfood); the only difference is who runs it.
6. **Conformance is the contract.** Every port ships a contract test suite; any adapter (human- or AI-written) must pass it.

## Non-goals (initially)
- Being a general PaaS UI for non-developers.
- Replacing Terraform/Pulumi (we *orchestrate* them).
- Supporting every cloud on day one.

## Iteration hooks
- Tagline/naming.
- Exact PaaS/SaaS/CaaS/IaaS taxonomy boundaries.
- OSS license & governance.
- Hosted business model.
