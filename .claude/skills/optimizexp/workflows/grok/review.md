# OptimizeXP review (Grok fallback)

If `review.rhai` cannot run, follow `../claude-code/review.md` steps verbatim.

Use the `workflow` tool only when registering/running Rhai. Cross-agent scorer:

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --mode init --run "$RUN_ID"
# or: node --experimental-strip-types …
```

## Phase 2 + survey closeout

After harm metrics hit 0: score excitement / ease / optimality (`positive-metrics.md`). End of run: persona survey → experiment backlog (`persona-survey.md`, `experiment-backlog.md`; `harness/survey.mts`). Flags: `--no-delight`, `--no-survey`, `--delight-passes`.
