# Epic proofs — agent instructions

Epic rollups that REUSE technical/experience proofs (import, never copy). Layer reference:
`.claude/skills/draft/references/epic-proofs/process.md` (use the **draft** skill).

## Run

- Tests: `pnpm --prefix src/draft/epic-proofs/<slug> test`
- Simulation: `pnpm --prefix src/draft/epic-proofs/<slug> run simulate` (offline, mocked fixtures)
- **Feature suites are executable**: `pnpm run test:behavior` runs every `features/*.feature`
  through cucumber (`cucumber.yaml`); step definitions live in `features/steps/*.ts`.

## Modify

- Keep `proof.json` `references` and `poc-rollup-ledger.md` in lockstep with the actual imports —
  the cascade gate resolves the rollup graph from them.
- Propagate compatibility changes DOWNWARD: if this epic needs a lower proof to change, change the
  lower proof and add the ADR there (see the layer reference's propagation rule).
- When a referenced technical/exp proof changes underneath you, `pnpm run draft:cascade` fails
  until this epic absorbs it: update the ledger row, simulation fixtures, features, and imports.
- Prose Gherkin in READMEs is documentation only; behavior claims belong in `features/`.

New packages: scaffold from `src/draft/_templates/epic/`.
