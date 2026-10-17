# ai-bdd run report fixtures (copied, not authored)

These three files are copies, byte for byte, of files in the ai-bdd repository. They are not edited here. HoBo
imports no ai-bdd code (ADR-0172): the release gate reads ai-bdd's `report.json` across a process boundary, and
these copies are the provider's side of that contract as far as HoBo's offline tests can see it.

| sha256 and file | Copied from (ai-bdd) | What it is |
|---|---|---|
| `39b3124e109795fcb285de613fb0eee1bf60322a017c0d1b6c54639e7bdebbb1  report.v1.passed.json` | `packages/sdk/test/report/fixtures/report.v1.passed.json` | A real `ai-bdd run --frozen --no-agent --reporter json,junit` over the offline test project (fake driver, fake models): five scenarios replayed, exit 0, zero model calls. Its one subjective step was judged from the verdict cache the characterizing run before it left. |
| `b8924cf22dd6ad3b5a7c235b24943e69b698f5b2d865e5db6020da5959f7b76f  report.v1.failed.json` | `packages/sdk/test/report/fixtures/report.v1.failed.json` | A real frozen run **without** `--no-agent` against a build with a regression: two failed scenarios, healed steps, eleven model calls (eight `act`, three `judge`), exit 1. The gate refuses it as replay-only evidence. |
| `7e907a6232b9b8de41e14154243d11612be07d8bba4e831085cf828f4ca3d423  run-report.v1.schema.json` | `packages/sdk/schema/run-report.v1.schema.json` | The JSON Schema (draft 2020-12) of `RunReport` v1. ai-bdd pins the same sha256 in its `schema.test.ts`: v1 is frozen once released, and a new field means `schemaVersion` 2 and a new file. This copy has the bounds added before release: `startedAt`/`finishedAt` in `toISOString()` form, non-negative durations and cost, judge values in 0..1. |

Copied on 2026-10-17 from the ai-bdd branch `claude/ecstatic-mayer-wbm2c3-runreport`: the two reports at `c1d4df5`,
where they were last changed by `ad10782` ("run report fixtures from real runs, validated against the published
schema"; still byte-identical at `4190d7e`), and the schema at `4190d7e` ("run report v1 pins startedAt and finishedAt
to the toISOString form"), which last changed it. Branch commits can be rewritten before they merge; the sha256 column
is the identity that holds, and `test/acceptance-fields.test.ts` fails if a file here stops matching it.

How they are used:

- `test/acceptance-parse.test.ts` parses both, and edits a copy of `passed` one field at a time for each refusal.
- `test/acceptance-fields.test.ts` walks the schema and holds `src/acceptance-fields.ts` to it: every field the
  schema requires is read by `parseAiBddRunReport` or ignored on purpose, with the reason written down.
- `test/release-gate.test.ts` has a stand-in `ai-bdd` (`test/helpers/fake-ai-bdd.mts`) write `passed` as the
  report of a run, so the digest recorded in a stage-gate record can be compared with these bytes.

To refresh after ai-bdd regenerates them (its `UPDATE_REPORT_FIXTURES=1` acceptance run), copy the files again,
run `sha256sum *.json` here, and update this table and `COPIED` in `test/acceptance-fields.test.ts` in the same
commit. A changed schema digest means ai-bdd published a new schema version: read it before updating anything.
