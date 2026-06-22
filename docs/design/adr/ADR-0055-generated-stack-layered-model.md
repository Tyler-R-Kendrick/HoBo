# ADR-0055 — The generated stack: a layered model for AI generation/self-healing/persistence

- **Status:** Accepted (amended by [ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md) — the **ui** layer is removed; generation is scoped to **infrastructure/runtime**, a four-layer model)
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 41 — The generated stack](../41-generated-stack.md) · [Plan 33 — Forge generation](../33-forge-generation-pipeline.md) (the loop) · [Plan 23 — trainable/live-fix](../23-stubbable-ai-implementations.md) · [Plan 39 — data plane](../39-data-plane-projections.md)/[Plan 34](../34-app-data-migrations.md) (data) · [Plan 11](../11-event-model.md)/[Plan 2](../02-sdk-api.md) (message) · [ADR-0025](./ADR-0025-use-training-directive-and-training-engine.md) (intelligence) · [ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md) (persistence) · [ADR-0037](./ADR-0037-sdk-codegen-surface.md) (codegen) · [Plan 9](../09-verification-open-questions.md)/[Plan 29](../29-contracts-compatibility.md)/[Plan 30](../30-policy-plane.md) (trust boundary)
- **Origin:** the vision framed AI generation as spanning several layers, but the suite documented each separately with no unifying model; message wasn't framed as generated at all.

## Context
HoBo's AI-native capabilities had grown organically: data-plane projections ([Plan 39](../39-data-plane-projections.md)), Forge-generated providers/impls ([Plan 33](../33-forge-generation-pipeline.md)), trainable semantic functions ([Plan 23](../23-stubbable-ai-implementations.md)), persisted mutation ([ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md)). These share one loop, one log, one trust boundary, and one persistence mechanism — but nothing said so, and **message-handler** generation wasn't framed as part of the same story. A unifying model makes the promise legible and exposes the real gap (message). Generating the developer's **product UI** is out of scope ([ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md)) — the meta-cloud generates infrastructure/runtime, not the app's front-end.

## Decision
1. **Adopt a four-layer taxonomy for generation: data · business · message · intelligence.** It is a *map over existing mechanisms*, not new runtime: each layer names what HoBo generates, who owns it, how it self-heals, and how it persists. Generation is scoped to **infrastructure/runtime** ([ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md)); the app UI is not a layer.
2. **One generation loop across layers** — the Forge loop (scaffold → LLM-fill → validate-sandboxed → repair → certify) ([Plan 33](../33-forge-generation-pipeline.md)); only inputs/oracles differ per layer.
3. **One trust boundary** — nothing generated is trusted without conformance + policy + eval ([Plan 9](../09-verification-open-questions.md)/[Plan 29](../29-contracts-compatibility.md)/[Plan 30](../30-policy-plane.md)); **one persistence mechanism** — region-scoped AST edits + provenance ([ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md)), generated regions demarcated, hand-written intent never clobbered, drift-gated ([ADR-0037](./ADR-0037-sdk-codegen-surface.md)).
4. **One self-healing reflex** — classify → propose-fix → validate → gated-apply (live-fix [Plan 23](../23-stubbable-ai-implementations.md) + drift/auto-rollback [Plan 5](../05-reliability-ha.md)), driven by the **SRE operator** ([Plan 40](../40-operator-agents.md)); where a layer can't auto-heal safely it degrades to *propose*.
5. **Frame message as a first-class generated layer:** message-handler/choreography generation from WIT-record event types.

## Alternatives considered
- **Leave the layers as separate features (no unifying model).** Rejected: the promise is illegible and the message gap stays hidden; one model also prevents divergent loops/trust-boundaries per layer.
- **A different layer cut** (e.g. by tier: frontend/backend/infra). Rejected: the data/business/message/intelligence cut matches HoBo's existing seams (event log, ports, training-engine) and the operator roster.
- **Include a ui layer / promise whole-app generation.** Rejected ([ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md)): generating the developer's product UI is app-build-out, outside the meta-cloud; cross-layer single-intent regeneration remains the long arc.

## Consequences
- **(+)** Makes the AI-native (infrastructure) promise legible end-to-end and reuses one loop/boundary/persistence across all layers — minimal new machinery (a map + one newly-framed layer).
- **(+)** Surfaces and closes the message gap; gives the operator agents ([Plan 40](../40-operator-agents.md)) a clear remit per layer.
- **(+)** Consistent safety story: deterministic codegen is reproducible; non-deterministic promotions are region-isolated, provenance-pinned, and prod-gated.
- **(−)** A taxonomy invites "is X a layer?" debates (e.g. networking/auth aren't in the four — deliberately, they're configured not generated).
- **(−)** Uniform framing can over-promise: layers self-heal unequally; the plan states this explicitly to avoid implying message heals as maturely as data/business today.
