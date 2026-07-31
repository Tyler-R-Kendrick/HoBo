# OptimizeXP review (Codex)

Follow the same contract as Claude Code `workflows/claude-code/review.md` (bus feedback, features, evidence, PR delivery).

Host specifics:

1. Skills live under `.agents/skills/optimizexp/`.
2. **No review-iteration budget.** Continue each cycle until **true** plateau. Outer **`--passes`** default **infinite** until metrics=0 or irreducible; optional finite N. Use **`read-bus`** before re-expect when review iteration > 1.
3. **Apply reduce experiments by default**; `--report-only` to measure only.
4. **Derive → implement → continue.** Known reductions must land this run.
5. Prefer `review-loop.mts` for `init` / `read-bus` / `aggregate-bus` / `should-stop` / `plateau`. Pass `--implementable-findings N` to `should-stop` (plateau requires N=0).
6. Evidence: `harness/capture-evidence.mts` + `post-pr-evidence.mts`.
7. Single-writer bus + evidence overwrite: this agent session only.

Stop on **true** plateau, blocked, user, or safety; write `.optimizexp/runs/<id>/summary.md`.

## Phase 2 + survey closeout

After harm metrics hit 0: score excitement / ease / optimality (`positive-metrics.md`). End of run: persona survey → experiment backlog (`persona-survey.md`, `experiment-backlog.md`; `harness/survey.mts`). Flags: `--no-delight`, `--no-survey`, `--delight-passes`.
