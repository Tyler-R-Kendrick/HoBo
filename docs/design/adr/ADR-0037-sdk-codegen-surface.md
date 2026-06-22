# ADR-0037 — SDK codegen surface & policy

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 2 — SDK/API](../02-sdk-api.md) (typed bindings, type ergonomics) · [Plan 24 — WIT interfaces](../24-wit-interfaces-reference.md) (jco guest-types) · [Plan 15 — CLI/DX](../15-cli-dx.md) (`hobo dev`/`build`) · [Plan 21](../21-resources-catalog.md) (`.allow()`) · [Plan 32](../32-reactive-live-queries.md)/[Plan 35](../35-search-vector-surface.md) (typed `useQuery`/search) · [Plan 6](../06-ai-native-agent-auth.md) (MCP parity) · [ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md) (offline/air-gap) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (G7) · [Convex generated-code capture](../../../competitors/convex/generated-code.md)
- **Origin:** the gap analysis (G7) found HoBo *promises* "type-safe end-to-end" + WIT-generated clients but never *shows* the codegen DX, while Aspire/Convex make typed codegen a headline. Designed via brainstorming + grill-with-docs.

## Context
HoBo's typed surface is referenced throughout — `ctx.bindings.db` is "a provider-agnostic typed client" ([Plan 2](../02-sdk-api.md)), "typed clients are generated from those interfaces (jco guest-types)" ([Plan 24](../24-wit-interfaces-reference.md)), "type-safe end to end" ([Plan 15](../15-cli-dx.md)) — but *what* is generated, *where* it lives, *when* it runs, and the developer-facing artifact were never specified. A Convex/Aspire audience expects a concrete codegen story (Convex commits `convex/_generated/`).

## Decision
1. **Sources → generated artifacts.** Codegen is a **deterministic pure function** of: the **WIT interfaces** (jco guest-types, [Plan 24](../24-wit-interfaces-reference.md)) + **Zod schemas** (step/workflow/`query`/search I/O) + **`.allow()`** scopes ([Plan 21](../21-resources-catalog.md)) + the **bindle graph** (`bind` edges, [Plan 22](../22-wiring-manifest.md)). It emits: typed `ctx.bindings.<name>` clients, typed `useQuery()`/search results ([Plan 32](../32-reactive-live-queries.md)/[Plan 35](../35-search-vector-surface.md)), typed workflow/step signatures, typed provider `.with()` options, and a typed **`api` function-tree** reference.
2. **Location & commit policy: a checked-in `_generated/` directory** (`.hobo/generated/` or `src/_generated/`). Rationale: reviewable in diffs, gives editors types with **no build step**, and is **offline/air-gap-friendly** ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)). **`hobo codegen --check`** is a CI gate that regenerates and fails on drift.
3. **When it runs:** `hobo dev` regenerates on change (watch); `hobo build` regenerates + fails on drift; `hobo new` scaffolds an initial `_generated/`. Because generation is deterministic, the same sources always produce the same output (reproducible; replay/air-gap friendly).
4. **Agent parity:** an MCP `codegen` tool so agents regenerate + typecheck like the CLI ([Plan 6](../06-ai-native-agent-auth.md)/[Plan 15](../15-cli-dx.md)).

## Alternatives considered
- **Virtual / build-resolved types (nothing committed).** Rejected as the default: needs the toolchain running to get types, diffs don't show the generated surface, and the offline/air-gap + editor-without-build story is weaker.
- **Both (committed default + virtual mode).** Rejected for v1 to avoid two codegen modes to document/test/keep consistent; the checked-in dir covers the cases that matter. (Virtual can be revisited as a monorepo nicety.)
- **No dedicated codegen story (leave it implied).** Rejected: the gap analysis (G7) is exactly that this was unstated; a Convex/Aspire audience expects it shown.

## Consequences
- **(+)** Closes G7 with a concrete, reviewable, offline-friendly codegen DX that matches the Convex/Aspire expectation; editors get full types with no build step.
- **(+)** Reuses existing sources (WIT/jco, Zod, `.allow()`, the graph) — codegen adds an emitter + a CLI/MCP command + a CI check, not a new model; determinism fits the replay/air-gap ethos ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)).
- **(−)** A checked-in `_generated/` dir adds diff noise on schema/binding changes and a `codegen --check` CI step (the standard tradeoff for committed generated code).
- **(−)** Generated TS quality depends on the WIT→TS (jco) mapping fidelity; advanced WIT types may need hand-tuned emit — an iteration hook.
