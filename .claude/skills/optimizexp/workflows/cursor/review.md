# OptimizeXP review (Cursor)

Same dual-regime contract as `../claude-code/review.md`.

## Hard stop rules

- **No review-iteration budget.** Continue each cycle until true plateau. Outer **`--passes`** default **infinite** through harm → delight until **pareto-equilibrium**.
- **Derive → implement → continue.** Do not plateau while findings still list S/M reductions. Pass `--implementable-findings N` to `should-stop`.
- `should-stop` **cycleStop** is not invocation complete — enter `delight_maximize` unless `--no-delight`.
- Finish only with:
  1. `summary.md` including `stopReason`
  2. `review-loop.mts --mode assert-complete --run <id>` exit 0
  3. `mark-complete --stop-reason <legal>`
- Paste assert-complete JSON when reporting optimizexp done.
- Product tests / one evidence capture / feature wired are **invalid** completion signals.
