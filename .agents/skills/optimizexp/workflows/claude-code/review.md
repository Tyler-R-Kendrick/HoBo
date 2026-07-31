# OptimizeXP review (Claude Code)

## Inputs

| Variable | Source | Default |
|---|---|---|
| `RUN_ID` | generated / flag | required |
| `EXPERIENCES` | `--ux/--dx/--ax` | `ux,dx,ax` |
| `PERSONA_IDS` | `--personas` / generated / intersection | resolved |
| `SURFACES` | flags / discovery | inferred |
| `REPORT_ONLY` | `--report-only` / `OPTIMIZEXP_REPORT_ONLY` | `false` |

**Stop policy:** per cycle, true plateau only (flat scores **and** empty implementable backlog). No review-iteration budget. Outer **`--passes`** default **infinite** until metrics=0 or irreducible; optional finite N.

## System preamble (every persona step)

```text
You are reviewing as persona <id>. Follow .optimizexp/personas/<id>.md verbatim.
Primary metrics: harms, friction, uncertainty (lower is better).
If pass > 1: read-bus first; on mismatches correct predictions
(correctedFrom + lessons + suggestedPredict scores).
Write-ahead: expect → act (capture) → outcome with scores + comparison.
After rescoring: apply a reduce experiment (unless REPORT_ONLY), then verify with new evidence.
Continue until true plateau — never invent a pass count stop.
```

## Steps

0. **Bare (no flags):** `init.mts --mode needs-init` → if needs init, run `init.mts` (all experiences, **all projects**), then review **ux+dx+ax** + all-projects. If ready, review all immediately.
1. **Projects:** resolve `--projects` / `--project` (default **all**). `init.mts --mode list-projects` for ids. Filter features by `feature.json.projects`.
2. **If `--init` only:** run `harness/init.mts` (honor `--projects`); read `INIT.md`; stop unless also reviewing.
3. **Init run**
   ```bash
   node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
     --mode init --run "$RUN_ID" --experiences "$EXPERIENCES"
   ```
4. **Load skill refs** — metrics, bus, review-loop, features, evidence, harness, pr-delivery, personas, init.
5. **Persona / feature seeds** — as flags require.
6. **Baseline** — optional; score cells.
7. **Persona scenario reviews** — `pass = 1, 2, …` until true plateau
   1. If `pass > 1`: **read-bus** and correct.
   2. Pick worst cell / scenario set.
   3. **Expect** → **Act + capture** → **Outcome**.
   4. **Rescore** — write `iterations/NNN/`.
   5. **Reduce** (default): implement top finding (+ independent S fixes). Skip only if `REPORT_ONLY`.
   6. **Verify** with new evidence.
   7. **should-stop**:
      ```bash
      node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
        --mode should-stop --run "$RUN_ID" --iteration "$pass" \
        --scores … --prev-scores … \
        --implementable-findings "$OPEN_S_M_COUNT"
      ```
8. **PR** — as configured.
9. **Summary** — scores, passes completed, stop reason, experiments; residual only for true external blocks.

## Subagent fan-out (optional)

- Persona Explore agents **read-only** may receive bus lesson JSON in the prompt.
- Coordinator is sole bus writer + harness invoker.
