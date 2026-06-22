# ADR-0055 — The generated stack: a layered model for AI generation/self-healing/persistence

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 41 — The generated stack](../41-generated-stack.md) · [Plan 33 — Forge generation](../33-forge-generation-pipeline.md) (the loop) · [Plan 23 — trainable/live-fix](../23-stubbable-ai-implementations.md) · [Plan 39 — data plane](../39-data-plane-projections.md)/[Plan 34](../34-app-data-migrations.md) (data) · [Plan 11](../11-event-model.md)/[Plan 2](../02-sdk-api.md) (message) · [ADR-0025](./ADR-0025-use-training-directive-and-training-engine.md) (intelligence) · [Plan 42](../42-ui-layer-generation.md) (ui) · [ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md) (persistence) · [ADR-0037](./ADR-0037-sdk-codegen-surface.md) (codegen) · [Plan 9](../09-verification-open-questions.md)/[Plan 29](../29-contracts-compatibility.md)/[Plan 30](../30-policy-plane.md) (trust boundary)
- **Origin:** the vision frames AI generation as spanning data/business/message/intelligence/ui layers, but the suite documented each separately with no unifying model; message and ui weren't framed as generated at all.

## Context
HoBo's AI-native capabilities had grown organically: data-plane projections ([Plan 39](../39-data-plane-projections.md)), Forge-generated providers/impls ([Plan 33](../33-forge-generation-pipeline.md)), trainable semantic functions ([Plan 23](../23-stubbable-ai-implementations.md)), persisted mutation ([ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md)). These share one loop, one log, one trust boundary, and one persistence mechanism — but nothing said so, and **message-handler** and **UI** generation weren't framed as part of the same story. A unifying model makes the promise legible and exposes the real gaps (message, ui).

## Decision
1. **Adopt a five-layer taxonomy for generation: data · business · message · intelligence · ui.** It is a *map over existing mechanisms*, not new runtime: each layer names what HoBo generates, who owns it, how it self-heals, and how it persists.
2. **One generation loop across layers** — the Forge loop (scaffold → LLM-fill → validate-sandboxed → repair → certify) ([Plan 33](../33-forge-generation-pipeline.md)); only inputs/oracles differ per layer (e.g. UI's oracle is Design.md + visual evals).
3. **One trust boundary** — nothing generated is trusted without conformance + policy + eval ([Plan 9](../09-verification-open-questions.md)/[Plan 29](../29-contracts-compatibility.md)/[Plan 30](../30-policy-plane.md)); **one persistence mechanism** — region-scoped AST edits + provenance ([ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md)), generated regions demarcated, hand-written intent never clobbered, drift-gated ([ADR-0037](./ADR-0037-sdk-codegen-surface.md)).
4. **One self-healing reflex** — classify → propose-fix → validate → gated-apply (live-fix [Plan 23](../23-stubbable-ai-implementations.md) + drift/auto-rollback [Plan 5](../05-reliability-ha.md)), driven by the **SRE operator** ([Plan 40](../40-operator-agents.md)); where a layer can't auto-heal safely it degrades to *propose*.
5. **Frame message and ui as first-class generated layers:** message-handler/choreography generation from WIT-record event types; UI generation in [Plan 42](../42-ui-layer-generation.md).

## Alternatives considered
- **Leave the layers as separate features (no unifying model).** Rejected: the promise is illegible and the message/ui gaps stay hidden; one model also prevents divergent loops/trust-boundaries per layer.
- **A different layer cut** (e.g. by tier: frontend/backend/infra). Rejected: the data/business/message/intelligence/ui cut matches HoBo's existing seams (event log, ports, training-engine, view()) and the operator roster.
- **Promise whole-app generation from one intent now.** Rejected/deferred: cross-layer single-intent regeneration is the long arc (a Hobo Code + Crew future); v1 generates per layer with shared machinery.

## Consequences
- **(+)** Makes the AI-native promise legible end-to-end and reuses one loop/boundary/persistence across all layers — minimal new machinery (a map + two newly-framed layers).
- **(+)** Surfaces and closes the message/ui gaps; gives the operator agents ([Plan 40](../40-operator-agents.md)) a clear remit per layer.
- **(+)** Consistent safety story: deterministic codegen is reproducible; non-deterministic promotions are region-isolated, provenance-pinned, and prod-gated.
- **(−)** A taxonomy invites "is X a layer?" debates (e.g. networking/auth aren't in the five — deliberately, they're configured not generated).
- **(−)** Uniform framing can over-promise: layers self-heal unequally; the plan states this explicitly to avoid implying UI/message heal as maturely as data/business today.
