# OptimizeXP review (Codex)

Follow the dual-regime loop in `../claude-code/review.md` and `references/review-loop.md` + `equilibrium.md`.

## Hard stop rules

1. **No review-iteration budget.** Continue each harm cycle until true plateau (`cycleStop`).
2. Outer **`--passes`** default **infinite** until **pareto-equilibrium** (harm → delight). Finite N only caps harm cycles; still enter delight unless `--no-delight`.
3. Prefer `review-loop.mts` for `init` / `read-bus` / `aggregate-bus` / `should-stop` / `equilibrium` / `assert-complete` / `mark-complete` / `status`.
4. Pass `--implementable-findings N` to `should-stop` (plateau requires N=0).
5. Pass **explicit** `--implementable-harm` and `--implementable-uplift` to `equilibrium` (omit ⇒ cannot stop).
6. **Derive → implement → continue.** Product green ≠ complete. Feature wired ≠ complete.
7. **Invocation complete** only when:
   ```bash
   node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
     --mode assert-complete --run "$RUN_ID"   # must exit 0
   node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
     --mode mark-complete --run "$RUN_ID" --stop-reason pareto-equilibrium
   ```
   Paste assert-complete JSON in the final report.

## Resume

`--mode status --run <id>` then continue if `status: running` or `INCOMPLETE.md` present.
