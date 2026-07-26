---
type: Implementation Plan
title: "Declarative resource codegen — builder sugar over trainables"
description: "Gap analysis and phased plan for the declarative greenfield surface: component builders (b.api/b.service/b.web) accept a declaration (intent + per-operation contract + rubric) instead of a handler, lowering to signature-only trainables (ADR-0125) served by contract-derived stubs and grown by the cold-start generation pipeline — making the @hobo/runtime training surface internal-by-default."
tags: [hobo, plans]
---

# Declarative resource codegen — builder sugar over trainables

> Baseline audited at commit `910b2d07` (2026-07-26) across `packages/bindles`,
> `packages/runtime/src/training/`, `docs/design/{sdk-api,generated-stack,walkthrough}.md`,
> and `site/`. Companion: [`0006-unimplemented-features-remediation.md`](./0006-unimplemented-features-remediation.md)
> (doc-truth reconciliation) and the trainable ADRs
> ([ADR-0125](../design/adr/03-data-plane.md#adr-0125), [ADR-0010](../design/adr/03-data-plane.md#adr-0010),
> [ADR-0076](../design/adr/02-identity-security.md#adr-0076)).

## 1. Context — the promise vs. the surface

The design promises a **declarative greenfield path**: a developer declares *what a component
is for* (shape, intent, contract, rubric) instead of implementing it, and HoBo generates the
WIT component implementation — stub-served on day one, grown by the cold-start generation
pipeline, promoted only through the conformance + eval + policy gate. The machinery for the
back half exists and is designed in depth (trainables, `training.define`, contract-derived
stub baselines, the generation pipeline, the three-lens promotion gate). What is missing is
the **front half**: the developer-facing declarative syntax, and the rule that trainables are
its internal compilation target rather than the thing users write.

## 2. Verified gaps

| # | Gap | Evidence |
|---|---|---|
| G1 | **No declarative surface on the component builders.** `b.api()` / `b.web()` accept only an optional handler thunk; `b.service()` accepts nothing. No intent/contract/rubric can be attached to a resource, so a bindle cannot declare code-to-be-generated. | `packages/bindles/src/bindle.ts` (`createBuilder`), `packages/bindles/src/types.ts` (`BindleBuilder`) |
| G2 | **Trainables are positioned as the app-developer surface.** Docs teach `training()` / `training.define()` / `@trainable` directly; nothing states they are the lowering target of higher-level sugar. | `docs/design/sdk-api.md` §Layer 4 trainables; `docs/design/walkthrough.md` §1.6 |
| G3 | **Naming/API drift.** Walkthrough: `"use trainable"` + `trainable(fn, …)` imported from `@hobo/bindles`. Implementation + sdk-api + generated-stack: `"use training"` directive, `training()` wrapper from `@hobo/runtime`, `@trainable` reserved for the decorator. | `docs/design/walkthrough.md` §1.6 vs `packages/runtime/src/training/index.ts` |
| G4 | **No defined lowering path** from a declared resource to `TrainableManifestFact`s, `hobo stub` codegen, and the cold-start generation pipeline. ADR-0125 defines lowering for the three *function-level* syntaxes only. | `docs/design/generated-stack.md` (stubs section stops at function/link level) |
| G5 | **Site docs demonstrate the wrong thing.** The bindles "greenfield" section shows a component declaration with no groundings — nothing that codegen could consume. | `site/src/pages/primitives/bindles.md` |
| G6 | **Runtime trainable surface is function-scoped.** `TrainingOptions`/`TrainableManifestFact` have `methodRef` but no resource binding (`stableId`), so a resource-level declaration cannot yet attribute its operations to the owning `api:`/`service:` resource in the manifest. | `packages/runtime/src/training/types.ts`, `data-models/trainable_manifest_fact.proto` |

## 3. Target design (summary — normative text lives in the design suite)

**Syntax 0 — declared components** (`docs/design/sdk-api.md` §Layer 4; lowering in
`docs/design/generated-stack.md`): a `@component` class whose `@operation` methods use
TC39 stage-3 decorators to annotate implementations with trainable options — a
**required shape** (contract `input` + `output`, or a `ref`), intent, per-parameter
metadata via `param()` (stage-3 has no parameter decorators; `param()` becomes one the
day TC39 ships them), and an **optional rubric** (absent → default exact-match rubric):

```ts
@component({ intent: "Public storefront API: ranked feed, cart, checkout." })
class Storefront {
  @operation({
    intent: "Order photos to maximize dwell without burying brand-new sellers.",
    contract: { input: RankInput, output: z.array(Photo) },   // shape — required
    params: { input: param("Candidate photos with engagement signals") },
    rubric: { dwellLift: 0.80, newSellerShare: 0.75 },        // optional
  })
  rankFeed = stub<RankInput, Photo[]>();                       // generate this

  @operation({ intent: "…", contract: { input: Cart, output: Order } })
  async checkout(cart: Cart): Promise<Order> { "use training"; return submitOrder(cart); }
}
const api = b.api(Storefront).dependsOn(catalog);
```

Semantics: each operation lowers to a trainable manifest fact (signature-only when
stubbed, ADR-0125) bound to the owning resource's stableId; `hobo stub`/codegen emits the
registrations into `src/_generated/trainables.ts`; the contract-derived stub baseline
(ADR-0076 `mock` mode) serves it from day one; the cold-start generation pipeline
(ADR-0010) synthesizes the implementation; promotion is the three-lens gate, with rubric
thresholds enforced at the eval lens and surfaced to policy (rule kind `trainable`).
Per-operation escalation (stub → `"use training"` body → plain body) never changes the
manifest shape. **Internality rule:** declared components and the bare `"use training"`
directive are the two doors app developers use; `training()` / `training.define()` /
`@trainable` remain public for library authors and tests but are documented as the
compilation target.

## 4. Phased plan

Each item sized for a one-shot issue (`.claude/skills/sdlc/references/linear-planning.md`);
phases are dependency-ordered.

### Phase 0 — Doc truth (landed with this plan)
- **0.1** `sdk-api.md`: add Syntax 0 (declaration form) + the internality rule. ✅
- **0.2** `generated-stack.md`: add "Declarative resources" lowering subsection. ✅
- **0.3** `walkthrough.md`: fix G3 drift (`"use training"`, `training()` from `@hobo/runtime`); show the declaration form first in §1.6. ✅
- **0.4** `site/`: rewrite the bindles greenfield section around the declaration form; align homepage card, getting-started callout, llms.txt. ✅

### Phase 0.5 — Runtime + builder surface (landed with this plan)
- **0.5.1** `@hobo/runtime`: rubric OPTIONAL (`TrainingOptions.rubric?`); shape required —
  a contract grounds with a `ref` or inline `input` + `output`, and a shaped contract with
  no ref gets a synthesized `decl://<methodRef>` contract ref. Stub baselines register
  with examples OR a declared output shape (call-time serving still reports cleanly when
  neither is available yet). ✅
- **0.5.2** `@hobo/runtime`: `@component({ intent })` class decorator (aggregates its
  operations' methodRefs into `Symbol.metadata` under
  `Symbol.for("hobo.component.metadata")`), `@operation` method/field decorator (field
  form: a `stub()` or absent initializer declares generation), `param()` per-parameter
  annotation, `componentMetadataOf()` introspection. All lower to the existing trainable
  machinery — byte-identical facts. ✅
- **0.5.3** `@hobo/bindles`: `b.api` / `b.web` / `b.service` accept a `ComponentBinding`
  (handler thunk or `@component` class, detected structurally via the shared symbol
  registry — no runtime dependency); a declared component's stored handler instantiates
  it, registering every operation (DI semantics). Manifest wire shape unchanged. ✅

### Phase 0.6 — Granular decorators + ambient scanning (landed with this plan)
- **0.6.1** `@hobo/runtime`: granular grounding decorators — `@intent(text)` / `@returns(text)`
  on methods, `@description(text)` on parameters — all optional, all **dual-mode** (TC39
  stage-3 and legacy `experimentalDecorators` call shapes; stage-3 has no parameter
  decorators, so `description()` doubles as a `params:` map value). Bare `@trainable`
  (class or method, both modes) composes declared groundings and registers with full
  inference fallbacks (intent from the method name, `decl://<Class>.<method>` contract
  refs, default exact-match rubric). ✅
- **0.6.2** `@hobo/runtime`: `scanDeclaredTrainables` + `generateDeclaredRegistrations` —
  the `hobo stub` half for **ambient** `@trainable export declare class` declarations
  (erased at compile time, so honored statically): parses intent/returns/description
  decorators and the TypeScript signature as the declared shape, and emits grounded,
  runnable `training.define` registrations for `src/_generated/`. ✅

### Phase 1 — Data model (G6)
- **1.1** Extend `trainable_manifest_fact.proto` + CUE with optional `resource_stable_id` and `operation` fields; regen `_generated`; conformance vectors for byte-identical lowering from all syntaxes. (PACT/proto/CUE evidence per architecture guard.)
- **1.2** `@hobo/bindles` manifest record: resources gain an optional frozen `declaration` block (intent + operation refs only — validators stay authoring-time; the wire form carries contract refs, mirroring `TrainingContract.ref`).

### Phase 2 — Manifest lowering (G1 remainder; needs Phase 1)
- **2.1** `toResourceRecord` lowers a declared component's operation facts into the
  manifest tagged with the resource stableId (the builder acceptance itself landed in
  0.5.3; this item is the wire-visible half). Duplicate operation refs a hard error
  (mirrors stable-ID rule). Red/green TDD; collect/manifest snapshot tests.

### Phase 3 — Codegen + runtime wiring (G4)
- **3.1** `hobo stub`: for each declared operation, emit the `training.define()` registration (same generated-region conventions as ADR-0048) and a typed client the app can import (`api.rankFeed(...)`).
- **3.2** Runtime link: declared operations resolve through `resolveTrainable` to the stub baseline; recorded calls land as specification-by-example traces (existing machinery, no new events).
- **3.3** Cold-start generation: feed resource-tagged facts to the generation pipeline; promotion writes into the operation's generated region. (Design already covers this; work is plumbing the resource binding through.)

### Phase 4 — Surface hygiene (G2, ongoing)
- **4.1** Grounding lint: warn when app code imports `training()`/`training.define()` directly outside `_generated/` (info-level; library packages exempt).
- **4.2** Walkthrough §1.6 + site: demote function-level forms to an "under the hood" appendix once Phase 2 ships (docs then demonstrate against the real builder).

## 5. Non-goals

- No new optimizer/engine surface — the training-engine port (ADR-0025) is untouched.
- No standalone training command (walkthrough invariant: "it's a property of your code").
- The `@trainable` decorator and `training()` wrapper are not deprecated — re-scoped as the
  documented lowering target and library-author surface.
