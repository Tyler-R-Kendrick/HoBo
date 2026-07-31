# OptimizeXP review (Cursor)

Same steps as `../claude-code/review.md` (bus feedback, features, evidence, PR).

Cursor notes:

- **No iterations flag.** Continue until true plateau.
- Before each re-expect after pass 1: `read-bus` / `@.optimizexp/bus/entries`; on mismatches set `correctedFrom` + `lessons`.
- Open persona files as `@.optimizexp/personas/<id>.md`.
- Feature evidence: `@.optimizexp/features/<slug>/evidence/…`.
- **Apply reduce experiments by default**; use `--report-only` for measure-only.
- **Derive → implement → continue.** Do not plateau while findings still list S/M reductions. Pass `--implementable-findings N` to `should-stop`.
