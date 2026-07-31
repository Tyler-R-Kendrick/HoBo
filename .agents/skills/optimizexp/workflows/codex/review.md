# OptimizeXP review (Codex)

Follow the same contract as Claude Code `workflows/claude-code/review.md` (bus feedback, features, evidence, PR delivery).

Host specifics:

1. Skills live under `.agents/skills/optimizexp/`.
2. **No iterations flag.** Continue until **true** plateau (flat scores **and** empty implementable backlog). Use **`read-bus`** before re-expect when pass > 1.
3. **Apply reduce experiments by default**; `--report-only` to measure only.
4. **Derive → implement → continue.** Known reductions must land this run.
5. Prefer `review-loop.mts` for `init` / `read-bus` / `aggregate-bus` / `should-stop` / `plateau`. Pass `--implementable-findings N` to `should-stop` (plateau requires N=0).
6. Evidence: `harness/capture-evidence.mts` + `post-pr-evidence.mts`.
7. Single-writer bus + evidence overwrite: this agent session only.

Stop on **true** plateau, blocked, user, or safety; write `.optimizexp/runs/<id>/summary.md`.
