# ADR-0056 — App-UI generation + Design.md design-system enforcement

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 42 — UI-layer generation](../42-ui-layer-generation.md) · [Plan 41 — generated stack](../41-generated-stack.md) (the ui layer) · [Plan 40 — Operator Agents](../40-operator-agents.md) (UX Designer) · [Plan 7 — dashboard](../07-ui-dashboard.md) (distinct: HoBo's own UI) · [Plan 39](../39-data-plane-projections.md)/[Plan 32](../32-reactive-live-queries.md) (typed reactive `view()`) · [Plan 21](../21-resources-catalog.md) (`web` resource) · [Plan 36](../36-end-user-auth.md) (`ctx.user`) · [Plan 23](../23-stubbable-ai-implementations.md)/[Plan 29](../29-contracts-compatibility.md)/[Plan 30](../30-policy-plane.md) (eval/trust boundary) · [ADR-0037](./ADR-0037-sdk-codegen-surface.md)/[ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md) (codegen/persist) · OpenUI ([openui.com](https://openui.com/)), json-render
- **Origin:** the vision asks HoBo to auto-generate the user's app front-ends (OpenUI + json-render) and to generate + enforce design-system constraints (Design.md). Both were entirely absent (Plan 7 is the platform's own dashboard; `web` is static hosting).

## Context
HoBo generates the data/business/intelligence layers but had **no story for the user's UI** — the visible top of the stack. The vision is specific: **OpenUI** to generate UI from intent, **json-render** as the render IR, and a **Design.md** that generates and *enforces* a design system. HoBo already has the substrate to make this safe and coherent: typed reactive `view()`s ([Plan 39](../39-data-plane-projections.md)/[Plan 32](../32-reactive-live-queries.md)), end-user auth ([Plan 36](../36-end-user-auth.md)), the `web` deploy path ([Plan 21](../21-resources-catalog.md)), the eval/conformance trust boundary, codegen + persisted mutation, and the operator-agent model ([Plan 40](../40-operator-agents.md)).

## Decision
1. **App-UI generation is first-class** (not a charter): a **`ui-render` port** (`hobo:ui-render`) with a built-in default and adapters — **OpenUI** (generative) + **json-render** (the deterministic, checked-in render IR) as reference adapters, custom adapters Matching-selected. Generation emits the json-render IR; OpenUI is the non-deterministic author of it, gated like any generated artifact.
2. **Design.md is the enforced design system** — tokens/components/layout/a11y/i18n/voice — authoritative and checked at a **design-conformance gate** (off-system color / ad-hoc component / a11y violation fails), with **visual/eval rubrics** ([Plan 23](../23-stubbable-ai-implementations.md)) as the oracle. It is the design analog of the conformance trust boundary, and the UI counterpart of WIT records for data.
3. **Generated UI composes existing planes:** typed-and-reactive from `view()` + WIT records ([Plan 39](../39-data-plane-projections.md)/[ADR-0051](./ADR-0051-wit-record-canonical-domain-schema.md)), auth-aware via `ctx.user`/`.allow()` ([Plan 36](../36-end-user-auth.md)), shipped via the `web` resource ([Plan 21](../21-resources-catalog.md)), owned + self-healed by the **UX Designer** operator ([Plan 40](../40-operator-agents.md)), persisted via [ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md) (the IR is the generated region) with `hobo codegen --check` drift gating.
4. **Distinct from [Plan 7](../07-ui-dashboard.md)** (HoBo's own dashboard) — different consumer, same SDK underneath.

## Alternatives considered
- **Forward-looking charter only** (Plan 38-style). Rejected per product decision: scope it as a real capability now (the substrate exists; engines stay behind a port to manage OpenUI's early/external nature).
- **No design-system enforcement** (generate freely). Rejected: ungated UI generation drifts off-brand and breaks a11y; Design.md gives a checkable oracle, mirroring contracts/evals.
- **Bundle a specific component library (shadcn/MUI) as the model.** Rejected: keep it behind the port + Design.md constraints; a library is an adapter/constraint set, not the model.
- **Generate framework code directly (not an IR).** Rejected as the primary path: a declarative json-render IR is diffable, portable across targets, and reviewable as a checked-in artifact ([ADR-0037](./ADR-0037-sdk-codegen-surface.md)); framework code is rendered *from* it.

## Consequences
- **(+)** Closes the top-of-stack gap: HoBo can generate a typed, reactive, on-brand, accessible front-end, owned by an operator agent, reusing data/auth/deploy/eval/persist machinery.
- **(+)** Design.md makes "on-brand + accessible" a *gate*, not a hope; portability holds (swap the engine, keep intent + Design.md).
- **(+)** Reactive-by-construction UI falls out of the data plane for free.
- **(−)** UI quality/aesthetics are harder to gate than code correctness; visual evals are coarser than conformance tests — v1 starts with token/a11y/structural checks and grows.
- **(−)** Depends on OpenUI (external, early) — mitigated by the port (swap/replace) and the deterministic json-render IR being the shipped artifact.
- **(−)** Another generated layer to keep coherent with schema/auth changes (handled by the shared regeneration + drift-gate machinery).
