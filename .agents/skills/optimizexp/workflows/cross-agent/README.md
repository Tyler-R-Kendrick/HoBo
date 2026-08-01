# Cross-agent deterministic runner

For hosts without native workflows (or as a scoring co-processor for all hosts).

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --help
# without installed deps:
node --experimental-strip-types .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --help
```

Modes: `init` | `status` | `should-stop` | `equilibrium` | `assert-complete` | `mark-complete` | `validate-bus` | `read-bus` | `aggregate-bus` | `score` | `plateau`.

Design-relevant SDLC work additionally uses `consensus-loop.mts`:

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/consensus-loop.mts --help
```

Its deterministic modes are `init`, `append`, `advance`, `status`, `decide`,
`validate`, `assert-yay`, and `close`. See `../../references/design-council.md`.

**Completion:** only `assert-complete` exit 0 + `mark-complete` ends an invocation. `should-stop` plateau is cycleStop only.

Optional WDK notes: `../../references/cross-agent/vercel-wdk.md`.
Plain runner has **zero** extra dependencies beyond repo `tsx`.
