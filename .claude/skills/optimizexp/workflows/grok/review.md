# OptimizeXP review (Grok fallback)

If `review.rhai` cannot run, follow `../claude-code/review.md` steps verbatim.

Use the `workflow` tool only when registering/running Rhai. Cross-agent scorer:

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --mode init --run "$RUN_ID"
# or: node --experimental-strip-types …
```
