# ADR-0048 — Persisted code-mutation mechanism (for `"use training"` promotion)

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 23 — Stubbable/AI implementations](../23-stubbable-ai-implementations.md) (`"use training"`, the impl loop) · [ADR-0025](./ADR-0025-use-training-directive-and-training-engine.md) (training-engine) · [ADR-0037](./ADR-0037-sdk-codegen-surface.md) (`_generated/` codegen) · [Plan 33](../33-forge-generation-pipeline.md) (Forge generation) · [Plan 11](../11-event-model.md) (`impl.*`/`training.*`) · [Plan 30](../30-policy-plane.md) (promotion gate) · [runtime-code-mutation-persistence pattern](../../../patterns/runtime-code-mutation-persistence.md) · open question [#29](../09-verification-open-questions.md)
- **Origin:** the ecosystem review found Plan 23 *promotes* AI-rewritten implementations (`impl.Promoted`/`training.Promoted`) but the **mechanism to persist a runtime/AI-generated code mutation back to source** was unspecified.

## Context
[Plan 23](../23-stubbable-ai-implementations.md) + [ADR-0025](./ADR-0025-use-training-directive-and-training-engine.md): the `training-engine` continuously rewrites `"use training"` semantic functions (prompt/code) and, when a candidate passes eval/conformance, **promotes** it. But "promote" needs a concrete, safe **persistence mechanism** — how a generated mutation lands back in source without clobbering hand-written code, with provenance and review. The [runtime-code-mutation-persistence pattern](../../../patterns/runtime-code-mutation-persistence.md) (ts-morph / recast / jscodeshift / magic-string + unified-diff apply) is the toolbox; this ADR specifies HoBo's use of it.

## Decision
1. **Promotion persists via AST-aware, region-scoped edits — never blind string patches.** A promoted candidate is applied with an **AST/codemod tool** (recast/ts-morph-style, format-preserving) confined to a **clearly demarcated generated region** of the `"use training"` method (the prompt/body the engine owns), leaving hand-written code untouched. Output is a minimal, format-preserving diff.
2. **Generated vs hand-written is explicit.** A `"use training"` method's optimizable region is marked (a directive boundary) so codegen/promotion only ever rewrites inside it — the same generated-vs-authored distinction as the `_generated/` codegen surface ([ADR-0037](./ADR-0037-sdk-codegen-surface.md)); promoted regions carry a header noting they're engine-managed + their provenance id.
3. **Provenance-pinned + gated, as a reviewable change.** A promotion emits the existing `training.Promoted`/`impl.Promoted` events ([Plan 11](../11-event-model.md)) carrying **signed provenance** (model, prompt, seed, eval/conformance report — the same trust boundary as Forge, [Plan 33](../33-forge-generation-pipeline.md)). The persisted mutation lands as a **gated change** ([Plan 30](../30-policy-plane.md)): low-risk → auto-commit to the generated region with provenance; prod/high-trust → **open a PR/Delta for human approval** (reusing the GitOps publisher + approval hooks, [Plan 28](../28-relay-gitops-pipelines.md)/[Plan 6](../06-ai-native-agent-auth.md)).
4. **Idempotent + round-trippable.** Re-applying the same candidate is a no-op (like `codegen --check`, [ADR-0037](./ADR-0037-sdk-codegen-surface.md)); the prior region is recoverable (the event log holds every candidate), so a promotion is reversible by re-promoting the previous one.

## Alternatives considered
- **Blind text/regex patching of source.** Rejected: clobbers formatting/hand-written code, not round-trippable, unreviewable.
- **Keep promoted code only in a runtime store (never persist to source).** Rejected: divorces running behavior from the repo (the "what's actually deployed" drifts from VCS), breaks review/audit-in-Git, and conflicts with the deterministic-build/`_generated/` model.
- **Always require a human PR for every promotion.** Rejected as the default: low-risk dev promotions should be able to auto-apply to the generated region (gated by policy); prod/high-trust escalates to a PR — same risk-tiering as Forge certification ([Plan 33](../33-forge-generation-pipeline.md)).

## Consequences
- **(+)** Closes #29: `"use training"` promotion has a concrete, safe persistence path — AST-aware, region-scoped, provenance-pinned, gated, idempotent — bridging the training loop ([Plan 23](../23-stubbable-ai-implementations.md)) to source + the `_generated/` surface ([ADR-0037](./ADR-0037-sdk-codegen-surface.md)).
- **(+)** Reuses the Forge trust boundary (signed provenance + eval/conformance), the policy gate, and the GitOps/PR + approval-hook machinery — no new plane, just a specified mechanism + the codemod toolchain.
- **(+)** Keeps running behavior in VCS (auditable, reviewable, replayable), preserving the deterministic-build promise.
- **(−)** AST codemod fidelity across TS constructs is non-trivial; advanced rewrites may need the human-PR path more often (acceptable, and the gate makes it explicit).
- **(−)** The generated-region boundary is a discipline authors must respect; editing inside it risks a future promotion overwriting hand edits (mitigated by the region header + the no-op/`--check` guard surfacing drift).
