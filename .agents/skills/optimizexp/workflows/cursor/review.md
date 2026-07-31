# OptimizeXP review (Cursor)

Same steps as `../claude-code/review.md` (bus feedback, features, evidence, PR).

Cursor notes:

- **No review-iteration budget.** Continue each cycle until true plateau. Outer **`--passes`** default **infinite** until metrics=0 or irreducible; optional finite N.
- Before each re-expect after pass 1: `read-bus` / `@.optimizexp/bus/entries`; on mismatches set `correctedFrom` + `lessons`.
- Open persona files as `@.optimizexp/personas/<id>.md`.
- Feature evidence: `@.optimizexp/features/<slug>/evidence/…`.
- **Apply reduce experiments by default**; use `--report-only` for measure-only.
- **Derive → implement → continue.** Do not plateau while findings still list S/M reductions. Pass `--implementable-findings N` to `should-stop`.

## Phase 2 + survey closeout

After harm metrics hit 0: score excitement / ease / optimality (`positive-metrics.md`). End of run: persona survey → experiment backlog (`persona-survey.md`, `experiment-backlog.md`; `harness/survey.mts`). Flags: `--no-delight`, `--no-survey`, `--delight-passes`.
