# OptimizeXP review (Grok fallback)

If `review.rhai` cannot run, follow `../claude-code/review.md` steps verbatim.

Use the `workflow` tool only when registering/running Rhai. Cross-agent scorer:

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
  --mode init --run "$RUN_ID" --experiences "$EXPERIENCES"
# status / should-stop / equilibrium / assert-complete / mark-complete
```

## Completion contract

1. Init run **before** product edits (`status: running`, `INCOMPLETE.md`).
2. Harm cycle → `should-stop` plateau = **switch to delight** (not done).
3. Delight uplifts until `equilibrium` candidate stop.
4. Write `summary.md` → `assert-complete` exit 0 → `mark-complete`.
5. Paste assert-complete JSON in the final user report.

**Never** stop on: tests green, feature wired, one evidence capture, or should-stop plateau alone.
