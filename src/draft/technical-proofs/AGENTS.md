# Technical proofs — agent instructions

Atomic technical concepts proven in isolation. Layer reference: `.claude/skills/draft/references/technical-proofs/process.md` (use the **draft** skill for any create/move/review work).

## Run

- Single package: `pnpm exec turbo run test --filter ./src/draft/technical-proofs/<slug>` or `pnpm --prefix src/draft/technical-proofs/<slug> test`
- Artifact gate for your change: `pnpm run draft:artifacts -- --staged`
- No live services; every boundary is mocked from Pact/protobuf/CUE fixtures.

## Modify — the cascade rule (mandatory)

Changing a technical proof is never local. Before you finish:

1. Find every epic/project that references this proof: its `proof.json` `references`, plus
   `git grep -l "technical-proofs/<slug>" src/draft/epic-proofs src/draft/projects`.
2. **Update each referencing rollup in the same change** — rollup ledger row, simulation, feature
   suite, and reference-architecture imports must absorb the new behavior (plan the change,
   apply `/improve`-style review to the blast radius, and record the decision in an ADR **beside
   this proof**, not only at the rollup layer).
3. `pnpm run draft:cascade -- --staged` enforces this mechanically; a waiver (proof.json +
   ADR) is the only sanctioned bypass.

New packages: scaffold from `src/draft/_templates/technical/` — proof.json, executed examples/,
notebook.ipynb (tslab, with outputs), bench/ (or ADR waiver), mermaid diagram where relevant.
