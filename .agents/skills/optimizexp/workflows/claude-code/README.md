# Claude Code — OptimizeXP review workflow

## Files

| File | Role |
|---|---|
| `review.md` | Orchestration prompt for the main agent / coordinator |
| `review.sh` | Optional helper to init a run directory |

## How to run

1. User invokes `/optimizexp` (or this workflow explicitly).
2. Main agent loads `review.md` steps and personas from `.optimizexp/personas/`.
3. Optional: persona subagents in parallel **read-only**; bus writes stay on the coordinator.
4. Loop harm → delight until equilibrium; `assert-complete` then `mark-complete`; write `.optimizexp/runs/<id>/summary.md`.

Generation rules: `../../references/workflow-generation.md`.
