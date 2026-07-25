---
layout: ../../layouts/Docs.astro
title: Extending the design
description: "How to add to HoBo in the design phase: design docs and ADRs, executable draft proofs, competitor captures, and promotion into production packages."
---

# Extending the design

"Extending HoBo" today means extending the design system: adding capability docs, decisions, executable proofs, or competitor grounding — each with its gate. This is also exactly how provider/adapter extensibility will work in the product: **contracts first, conformance as the certifier**.

## Add or change a design doc

1. Pick the owning capability doc in [`docs/design/`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/index.md) (or add a new row to the index for a genuinely new decision area).
2. Keep terminology canonical — new terms go in the [glossary](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/glossary.md); new event families go in [`event-families.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/event-families.md) **before** use.
3. Record decisions as ADRs in the right thematic volume with a stable `#adr-NNNN` anchor, and index them.
4. Run `pnpm run docs:design-lint` and the traceability validator — broken anchors, duplicate glossary terms, and unindexed ADR references fail the gate.

## Prove a claim with a draft package

Design claims become executable under `src/draft/<kind>/<slug>` — see the [draft taxonomy](/HoBo/agents/skills/) and the scaffolding templates in `src/draft/_templates/`:

1. Choose the layer: technical proof, experience proof (`dx`/`ux`/`cx`/`ax`/`api`), epic rollup, or project rollup.
2. Ship the required artifacts per `proof.json`: gate-**executed** `examples/`, an executed notebook, a bench (technical), or cucumber features (epic). `pnpm run draft:artifacts` enforces this.
3. If your proof changes, update every referencing epic/project rollup in the same diff (`pnpm run draft:cascade`).
4. Add the human-readable proof record under `docs/design/proofs/` and link both directions.

## Ground it against a competitor

Every competitive claim is backed by a capture in [`docs/competitors/`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/competitors/index.md). To add one, follow the established pattern — one consolidated `<vendor>.md` with:

1. Positioning and overview (linked upstream sources).
2. The factual feature surface (API/CLI/config excerpts, limited to what's needed).
3. Differentiators and exploitable gaps.
4. A closing `## hobo-mapping` section: HoBo's equivalent for every feature, and where HoBo deliberately goes further.

## Implement toward production

When a slice graduates from proof to production:

1. Start from the Linear issue / [implementation plan](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/implementation-plan.md) and the matching design doc.
2. Build in the owning `packages/` workspace under the [architecture rules](/HoBo/agents/rules/) — PACT boundaries, protobuf + CUE types, parse-don't-validate, event-driven CQRS.
3. Record the promotion in `scripts/promotions.json`; the proof freezes and the package copy becomes canonical (`pnpm run promotions:check` enforces it).
4. Update docs in the same change — the [freshness gate](/HoBo/develop/gates/) will insist anyway.

## Extending this website

The site itself is a self-contained Astro project under [`site/`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/site) — see its README for conventions. Content pages are markdown; navigation lives in one file (`src/nav.ts`); the design system is one stylesheet. Keep pages curated summaries that deep-link to canonical sources rather than mirrors that drift.
