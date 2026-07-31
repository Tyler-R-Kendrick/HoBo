# Cross-agent deterministic runner

For hosts without native workflows (or as a scoring co-processor for all hosts).

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --help
# without installed deps:
node --experimental-strip-types .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --help
```

Modes: `init` | `validate-bus` | `score` | `plateau`.

Optional WDK notes: `../../references/cross-agent/vercel-wdk.md`.
Plain runner has **zero** extra dependencies beyond repo `tsx`.
