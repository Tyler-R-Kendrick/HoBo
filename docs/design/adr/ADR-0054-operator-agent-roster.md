# ADR-0054 — Operator Agents (the Crew): built-in autonomous Yard services

- **Status:** Accepted (amended by [ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md) — the **UX-Designer** operator is removed as app-build-out; the roster is SRE/Endpoint Monitor/GitOps/Platform Engineer)
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 40 — Operator Agents](../40-operator-agents.md) · [Plan 6 — AI-native & agent auth](../06-ai-native-agent-auth.md) (principal model, `agent()`, MCP) · [Plan 30 — Policy plane](../30-policy-plane.md) (gates/obligations) · [Plan 23 — live-fix](../23-stubbable-ai-implementations.md) · [Plan 14 — Observability](../14-observability.md) · [Plan 5 — Reliability/HA](../05-reliability-ha.md) (drift/canary) · [Plan 28 — Relay/GitOps/Pipelines](../28-relay-gitops-pipelines.md) · [Plan 25](../25-resource-definitions-matching.md)/[Plan 33](../33-forge-generation-pipeline.md) (Platform Engineer) · [technologies/holmesgpt-sre-agent](../../../technologies/holmesgpt-sre-agent.md) · [ADR-0019 — personas](./ADR-0019-persona-prioritization-icp.md)
- **Origin:** the product vision names a first-class operator-agent roster (SRE/Endpoint Monitor/GitOps/Platform Engineer). The substrate existed (agent-principal model, MCP, live-fix, drift, pipelines, observability) but no roster was specified, and "the HoBo Agent" (proxy) collided with the term.

## Context
HoBo already treats agents as first-class principals ([Plan 6](../06-ai-native-agent-auth.md)) and exposes every capability over MCP, and it has the operational substrate (live-fix, drift/auto-rollback, pipelines, SLO/alerting, observability projections, Forge, Matching). What it lacked was a **named set of operator agents** that *use* that substrate to run the platform — the concrete form of the "AI SRE / AI GitOps / AI policy enforcement" goals. Two questions: (1) are these built-in or left to each team; (2) how do they relate to the existing "agent" notions (and the proxy formerly called "the HoBo Agent").

## Decision
1. **Ship a built-in roster — the Crew** (SRE, Endpoint Monitor, GitOps, Platform Engineer) as **first-class Yard services**, batteries-included but **pluggable** (each disableable/overridable per Yard; each brain is an **engine behind a port** with a built-in default + optional external providers).
2. **Each operator is a named principal on the existing model** ([Plan 6](../06-ai-native-agent-auth.md)): SVID identity, per-agent policy + spend caps, event-sourced runs, MCP surface, least-privilege `.allow()`. No new identity/policy mechanism — the roster *is* the agent-principal model applied to operations.
3. **Reads are autonomous; writes are policy-gated** ([Plan 30](../30-policy-plane.md)): diagnosis/monitoring run freely; mutations take an effect/obligation (auto / canary-with-auto-rollback / require-approval) keyed by blast radius + environment ([Plan 5](../05-reliability-ha.md)).
4. **Operators compose existing subsystems, they don't reinvent them:** SRE→live-fix+observability+drift; Endpoint Monitor→SLO/alerting; GitOps→pipelines+can-deploy; Platform Engineer→Matching+packs+Forge. External brains (HolmesGPT for SRE) sit behind ports.
5. **Reserve "Agent" for principals; rename the proxy to the Relay** ([Plan 28](../28-relay-gitops-pipelines.md)). Events: a thin `crew.*` family + reuse of existing `run.*`/`incident.*`/`pipeline.*`/`policy.Decided`.

## Alternatives considered
- **Skills-only on the generic `agent()` primitive (no built-in services).** Rejected as the default per product decision: leaves every team to wire core operations; loses the batteries-included, audited-by-default value. (Skills still exist — `@hobo/agent-skills` — and compose *into* the built-in operators.)
- **Operators as opaque managed features (not principals).** Rejected: would break HoBo's "every actor is an audited principal" invariant; operators must carry identity + policy + an audit trail like any agent.
- **Bundle HolmesGPT (or any external brain) as mandatory.** Rejected: engines stay behind ports (optional providers), preserving the no-egress/air-gap and no-lock-in stances ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)/[ADR-0024](./ADR-0024-portability-conformance-guarantee.md)).
- **Keep calling the proxy "the HoBo Agent".** Rejected: collides with the roster; "Agent" now means an autonomous principal, the proxy is the Relay.

## Consequences
- **(+)** Delivers "AI SRE / AI GitOps / AI policy enforcement" concretely, reusing the principal/policy/event/MCP substrate — little new machinery (a roster + a thin `crew.*` event family + per-operator engine ports).
- **(+)** Audited, policy-gated, replayable operations out of the box; humans and external agents can inspect/override every operator via MCP.
- **(+)** Pluggable: swap an engine, disable an operator, or BYO — the deterministic core is unaffected; air-gap-friendly.
- **(−)** Built-in operators are opinionated; teams that want different behavior must override/disable (mitigated by engines-behind-ports + skills).
- **(−)** Autonomous operators acting on prod are a trust surface; mitigated by default-gated writes, spend caps, blast-radius limits, and full audit — but tuning those defaults is an iteration hook.
- **(−)** A naming migration ("HoBo Agent"→"Relay") touched several docs (done in this change).
