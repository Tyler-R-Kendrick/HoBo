# ADR-0049 — Reserve "Hobo Code" for the configuration + code DSL

- **Status:** Accepted (naming + charter); **the DSL itself is forward-looking — design TBD, not in v1 scope**
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 38 — Hobo Code DSL](../38-hobo-code-dsl.md) · [Plan 2 — SDK/API](../02-sdk-api.md) · [Plan 22 — Wiring & the manifest IR](../22-wiring-manifest.md) · [Plan 21 — Resources & `.allow()`](../21-resources-catalog.md) · [Plan 33 — Forge generation](../33-forge-generation-pipeline.md)/[Plan 23 — Stubbable/trainable](../23-stubbable-ai-implementations.md) · [ADR-0026 — Scope model](./ADR-0026-scope-model-yard-camp-bindle.md) · [Plan 6 — Capability Manifest](../06-ai-native-agent-auth.md)
- **Origin:** terminology refactor — the phrase "Hobo Code" was being used for the auth+capability standard, but is wanted for a future AI-native authoring DSL.

## Context
"Hobo Code" had been the name of HoBo's machine-readable **auth + capability standard** (the `auth.md` analog: `signs.md`/`capabilities.json`/`auth.json`). Separately, HoBo is **AI-native** — agents and the Forge generate, repair, and optimize HoBo artifacts ([Plan 6](../06-ai-native-agent-auth.md)/[Plan 33](../33-forge-generation-pipeline.md)/[Plan 23](../23-stubbable-ai-implementations.md)) — and the TypeScript+IfC surface ([Plan 2](../02-sdk-api.md)/[Plan 21](../21-resources-catalog.md)), while ideal for humans, is a noisy generation/training target (large grammar, host imports, collection-time side-effects, hard-to-score ASTs). We want a purpose-built DSL that is **optimal for AI generation, training, and optimization** and that configures **Yards/Camps/Bindles** *and* code in one human-readable surface. The name "Hobo Code" fits that DSL far better than it fit a manifest format.

## Decision
1. **Rename the auth+capability standard** from "Hobo Code" to **Capability Manifest** ([Plan 6](../06-ai-native-agent-auth.md)) — published files unchanged in spirit (`index/signs/capabilities/auth/cost.json`), now served at `/.well-known/capability-manifest/`, WIT `hobo:capability-manifest`. (Done as part of this refactor.)
2. **Reserve "Hobo Code"** to mean the planned **configuration + code DSL** ([Plan 38](../38-hobo-code-dsl.md)): a human-readable surface to declare scope/topology (`Yard`/`Camp`/`Bindle` + resources + `.allow()` + wiring) and behavior (`workflow`/`step`/`actor`/`saga`/`agent`, trainable methods), designed to be **small, regular, declarative-first, deterministic, and AI-optimal** (stable canonical AST, low ambiguity, token-efficient).
3. **Charter, not spec.** Hobo Code is a **sibling authoring front-end** to the TypeScript SDK — both lower to the same **Manifest IR** ([Plan 22](../22-wiring-manifest.md)) and runtime constructs, adding nothing semantically new; the scope model is unchanged ([ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md)). The grammar/toolchain (parser, canonical formatter, LSP, TS↔Hobo Code transpiler) is **deferred**; v1 does not depend on it.

## Alternatives considered
- **Keep "Hobo Code" for the manifest; pick another DSL name.** Rejected: the manifest is a *capability/auth advertisement*, not "code"; "Capability Manifest" describes it accurately, and "Hobo Code" is the natural name for an authoring language.
- **No DSL — TypeScript+IfC is the only surface.** Rejected as the *long-term* stance: a general-purpose language is a poor AI generation/training/optimization target. (TS remains the v1 surface; the DSL is additive and future.)
- **Build the DSL now (v1).** Rejected: premature — the Manifest IR + codegen + Forge loop must stabilize first; this ADR reserves the name and intent without committing v1 effort.
- **A new runtime/semantics for the DSL.** Rejected: it must be a pure front-end over the existing IR to avoid forking the model and to stay round-trippable with TypeScript.

## Consequences
- **(+)** Frees an apt name for the AI-native authoring DSL while giving the auth+capability standard an accurate one; removes the naming overload.
- **(+)** Keeps the suite coherent: one IR, two front-ends; the Forge/training-engine get a compact, scoreable target without new runtime semantics.
- **(+)** Forward-compatible: nothing in v1 depends on Hobo Code; it can be prototyped (config half first) over the stable IR.
- **(−)** Introduces a forward-looking term into the glossary that does not yet have an implementation — must stay clearly marked *reserved/future* to avoid implying it ships in v1.
- **(−)** Eventually two authoring surfaces to keep semantically aligned (TS ↔ Hobo Code), which the shared IR + a transpiler must enforce.
