# OptimizeXP review (Claude Code)

## Inputs

| Variable | Source | Default |
|---|---|---|
| `RUN_ID` | generated / flag | required |
| `EXPERIENCES` | `--ux/--dx/--ax` | `ux,dx,ax` |
| `PERSONA_IDS` | `--personas` / generated / intersection | resolved |
| `SURFACES` | flags / discovery | inferred |
| `REPORT_ONLY` | `--report-only` / `OPTIMIZEXP_REPORT_ONLY` | `false` |

**Stop policy:**

- Per **harm cycle**: true plateau only (flat scores **and** empty implementable backlog) → **cycleStop**, not done.
- Outer **`--passes`** default **infinite** through **harm_reduce → delight_maximize** until **`pareto-equilibrium`**.
- **Invocation complete** only when `assert-complete` exits 0 and `mark-complete` succeeds. Paste assert JSON in the final report.
- Product tests green / feature wired / one evidence capture is **never** complete.

## System preamble (every persona step)

```text
You are reviewing as persona <id>. Follow persona file verbatim.
Primary metrics: harms, friction, uncertainty (lower better).
Delight metrics after harm floor: excitement, easeOfUse, perceivedOptimality (higher better).
If pass > 1: read-bus first; on mismatches correct predictions
(correctedFrom + lessons + suggestedPredict scores).
Write-ahead: expect → act (capture) → outcome with scores + comparison.
After rescoring: apply a reduce/uplift experiment (unless REPORT_ONLY), then verify.
should-stop plateau = switch to delight (unless --no-delight). Never claim done on plateau.
Complete only after assert-complete ok + mark-complete.
```

## Steps

0. **Bare (no flags):** `init.mts --mode needs-init` → if needs init, run `init.mts` (all experiences, **all projects**), then review **ux+dx+ax** + all-projects. If ready, review all immediately.
1. **Projects:** resolve `--projects` / `--project` (default **all**). `init.mts --mode list-projects` for ids. Filter features by `feature.json.projects`.
2. **If `--init` only:** run `harness/init.mts` (honor `--projects`); read `INIT.md`; stop unless also reviewing.
3. **Init run (before product edits)**
   ```bash
   node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
     --mode init --run "$RUN_ID" --experiences "$EXPERIENCES" \
     --personas "$PERSONA_IDS" --features "$FEATURE_IDS" --projects "$PROJECT_IDS"
   ```
   Confirm `status: running`, `stopPolicy: infinite-until-pareto-equilibrium`, `INCOMPLETE.md`.
4. **Load skill refs** — metrics, positive-metrics, equilibrium, bus, review-loop, features, evidence, harness, personas.
5. **Persona / feature seeds** — as flags require (still inside this run).
6. **Baseline** — score cells; write `baseline.json` / `iterations/000`.
7. **Harm regime** — `pass = 1, 2, …` until true plateau
   1. If `pass > 1`: **read-bus** and correct.
   2. Pick worst cell / scenario set.
   3. **Expect** → **Act + capture** → **Outcome**.
   4. **Rescore** — write `iterations/NNN/`.
   5. **Reduce** (default): implement top finding (+ independent S fixes). Skip only if `REPORT_ONLY`.
   6. **Verify** with new evidence.
   7. **should-stop** (cycle only):
      ```bash
      node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
        --mode should-stop --run "$RUN_ID" --iteration "$pass" \
        --scores … --prev-scores … \
        --implementable-findings "$OPEN_S_M_COUNT"
      ```
      On `cycleStop` + `harm-floor-switch-to-delight` → enter step 8. Do **not** finish.
8. **Delight regime** (required unless `--no-delight`)
   1. Survey + rank backlog (`harness/survey.mts`).
   2. Apply Pareto-admissible uplifts; re-capture; score positive + cognitive.
   3. If harm regressed → return to step 7.
   4. **equilibrium**:
      ```bash
      node --import tsx …/review-loop.mts --mode equilibrium --run "$RUN_ID" \
        --scores … --prev-scores … \
        --implementable-harm 0 --implementable-uplift 0 \
        --regime delight_maximize
      ```
      Pass explicit implementable counts (omit = cannot stop).
9. **Closeout (required)**
   1. Write `summary.md` with `stopReason`.
   2. `assert-complete --run "$RUN_ID"` must exit 0.
   3. `mark-complete --run "$RUN_ID" --stop-reason pareto-equilibrium` (or other legal terminal).
   4. Paste assert-complete JSON in the user-facing final report.
10. **PR** — as configured; post evidence.

## Resume

```bash
node --import tsx …/review-loop.mts --mode status --run "$RUN_ID"
node --import tsx …/review-loop.mts --mode assert-complete --run "$RUN_ID"
```

If incomplete → continue from current `regime`. Never claim done from compaction memory alone.

## Subagent fan-out (optional)

- Persona Explore agents **read-only** may receive bus lesson JSON in the prompt.
- Coordinator is sole bus writer + harness invoker + sole assert-complete caller.
