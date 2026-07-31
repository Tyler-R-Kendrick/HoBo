---
type: Agent Skill Reference
title: "OptimizeXP review loop"
description: "Iterative experience review that reduces harms, friction, and uncertainty until plateau."
tags: [hobo, optimizexp, review-loop, hcd]
timestamp: 2026-07-30T00:00:00Z
---

# Review loop

Goal: **drive metric scores down** by measuring, applying a **reduce experiment**, and re-scoring each review iteration until **true plateau**. Orchestration phases run as designed.

**`--passes` (default `infinite`)** controls **outer completion cycles**. Each cycle must reach true plateau (all implementable findings addressed). There is **no** `--iterations` flag and **no** review-iteration budget inside a cycle.

```text
  # Orchestration
  Scope (passes: infinite | N)
  loop cycle = 1, 2, …:
    Baseline (re-baseline if cycle > 1)
    for reviewIteration in 1, 2, …:
      Read bus → Expect → Act+evidence → Outcome → Rescore
      → Reduce experiment (default ON; --report-only to skip)
      → Verify
      stop cycle if true_plateau OR user OR safety OR blocked
    cyclesCompleted = cycle
    if infinite:
      stop all if metrics all 0 OR (re-survey finds no new implementable findings)
    if finite N and cycle >= N:
      stop all
  summary
```

**Flags** (`references/flags.md`): `--passes infinite|N`, `--report-only`.

## 0. Create the run

```text
runId = <YYYYMMDD>-<experiences>-<short-slug>
.optimizexp/runs/<runId>/
  scope.json
  baseline.json
  iterations/
  artifacts/
  summary.md          # written at stop
```

Host workflow (if any): load from `workflows/<host>/` after reading `references/workflow-generation.md`.

## 1. Scope

1. **Bare (no flags):** run `init.mts --mode needs-init`; if true, `init.mts` for all experiences + **all projects**, then review with **ux+dx+ax** and **all-projects**. If false, review all experiences + all-projects immediately (`references/init.md` § Auto-init).
2. Resolve **projects** (default `all-projects`) and **experiences** (default all three) (`references/flags.md`).
3. **Persona seeds** (`--persona` …): rewrite each seed → `.optimizexp/personas/<id>.md` (`references/personas.md`). Harness: `generate-persona.mts`. Never use the raw seed as the review system prompt.
4. **Persona selection** (single set for the whole run — review **and** feature fan-out):
   1. `--personas` if set → exactly those ids
   2. Else if any personas generated this run → exactly those ids
   3. Else → all on-disk personas intersecting experiences (fallback: all on-disk)
   4. Apply `--max-personas`
5. **Feature seeds** (`--feature` …): for each seed, create `.optimizexp/features/<id>/` with **one** `<id>-<persona>.feature` **per selected persona**, plus `steps/` bindings, Vitest stubs, and discovery-wired implementations when code exists (`references/features.md`). Tag `feature.json.projects` from project selection. Harness: `generate-feature.mts`. Do not delete `evidence/` on regenerate.
6. **Select features for review:** `--features` list if set; else features whose `projects` tag intersects project selection (missing tag ≈ `root`).
7. List surfaces; prefer smallest set covering critical paths within selected projects.
8. Load experience references only for selected experiences.
9. Resolve `passes` (default **infinite**). Per-cycle stop = true plateau; outer stop = metrics 0 or irreducible (or finite cap).
10. Write `scope.json` with `passes`, `passesLabel`, `cyclesCompleted`, `stopPolicy`, projects, personas, features, seeds, `autoInitRan`.

## 2. Baseline

For each persona × surface cell, score harms / friction / uncertainty (`references/metrics.md`). Prefer evidence from:

- **Prior bus entries** for this run and prior runs on the same feature/persona (read via bus feedback)
- Existing docs (`AGENTS.md`, `site/DESIGN.md`, `docs/agent-tooling.md`)
- One cheap probe command (smoke, lint --help, design:lint) rather than full suites

Write `baseline.json` and iteration `000/scores.json`.

## 2b. Bus feedback (read before every expect after iteration 0)

Agents **must read the bus** before predicting again — especially after being wrong.

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
  --mode read-bus --run <runId> --limit 20

# mismatches only (failed expectations / positive score deltas)
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
  --mode read-bus --run <runId> --mismatches-only
```

### What to load

| Source | Use |
|---|---|
| Prior **outcome** `comparison.matchedExpectation === false` | Correct next **expect** (behavior + predicted scores) |
| Prior **deltaFromExpect** with positive metrics | Do not re-predict the same optimistic scores without new evidence |
| Prior **act** `observed` scores vs **judged** | Calibrate how harsh the persona is on this surface |
| Prior **feelings** / desirability | Keep persona voice consistent; note trust drops |
| Prior **evidence** paths | Re-open what was seen; avoid re-probing blindly |
| Prior **reduction.md** | Know what already was tried |

### Correction protocol (when the agent was wrong)

1. Classify error: wrong **behavior** forecast, wrong **score** forecast, or both.
2. Write next expect with `correctedFrom: <prior-outcome-id>` and optional `lessons: ["…"]` on the expect entry.
3. **Tighten** predicted scores toward last judged scores unless a real reduction landed.
4. Change the **action** if the command/surface was wrong (update bindings via `generate-feature --mode implement` if needed).
5. Never discard the bus history — append only.

See also `references/agent-bus.md` § Reading the bus.

## 3. Expect (write-ahead) + predicted scores

1. **Read bus feedback** (required from iteration 1+; recommended at baseline).
2. Ensure a Gherkin scenario exists under `.optimizexp/features/<feature>/*.feature` (persona tags required).
3. Write a bus **expect** entry with `featureId` + `scenarioSlug` (`references/agent-bus.md`).
4. Include formal **`scores`** with `role: "predicted"` — informed by prior outcomes when present.
5. If correcting: set `correctedFrom` + `lessons`.
6. Expectations come from the **persona prompt** + **bus lessons**, not ungrounded optimism.

## 4. Act + capture evidence + observed scores

Exercise the surface **and** capture what the persona sees:

```bash
node --import tsx .agents/skills/optimizexp/harness/capture-evidence.mts --mode capture \
  --feature <id> --scenario <slug> --driver <cli|tui|web|native> \
  --command '…'   # or --url / --native-cmd
```

| Interface | Capture |
|---|---|
| cli | transcript + terminal cols×rows |
| tui | asciinema if available + transcript + size |
| web | Playwright/browser MCP video → screenshots → stitch |
| native | computer-use recorder → screenshots → stitch |

Then write a bus **act** entry (`expects` → expect id) with:

- action metadata (driver, command, exit code, timestamps)
- `evidence` path
- formal **`scores`** with `role: "observed"` from the capture (first-pass)

Rules: prefer **video**; overwrite previous `primary.*` for that scenario only; redaction on. Details: `references/evidence.md`, `references/harness.md`.

Prefer read-only / dry-run / staged gates for **probes**. **Reduce** (next step) may mutate product surfaces when not `--report-only`.

## 5. Outcome + judged scores + comparison

Write the bus **outcome** entry:

- actual Gherkin / observed result
- feelings (persona voice about the **evidence**)
- desirability
- formal **`scores`** with `role: "judged"` (authoritative for the iteration)
- **`comparison`**: `deltaFromExpect`, optional `deltaFromAct`, `matchedExpectation` (behavior **and** scores within tolerance)
- `evidence` path + `actId`

Helpers:

```bash
node --import tsx .agents/skills/optimizexp/harness/scorecard.mts --mode compare \
  --expect <expect.json> --act <act.json> --outcome <outcome.json>
```

## 6. Rescore (from judged outcomes)

Roll up **outcome** scorecards into cells (not predictions):

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
  --mode aggregate-bus --run <runId>
```

Write `iterations/<nnn>/scores.json` + `findings.md` ranked by leverage (impact on metric_max / effort). Cite score deltas from `comparison`.

Finding shape:

```markdown
### F-<n>: <title>
- Metrics (judged): friction=3, uncertainty=2 (Δ expect +2 friction)
- Personas: developer
- Evidence: features/…/evidence/…/primary.* , bus outcome id …
- Smallest reduction: …
- Effort: S|M|L
```

## 7. Reduce experiment (default ON) + verify + commit

Pick the **top finding** by leverage (impact on `metric_max` / effort). Then **implement it**.

### Default (apply experiment)

1. Design the **smallest safe experiment** that can lower judged friction, uncertainty, or harms on the measured surface.
2. **Apply it now** in the repo (scripts, copy, docs, harness, package entrypoints, UI, setup paths, etc.). Prefer local reversible edits. Run local install/setup when that is the honest next step for the persona **and** the workspace allows it (see § Anti-stall).
3. Write `iterations/<nnn>/reduction.md`: finding id, hypothesis, files touched, expected metric deltas, residual risk, `result: improved|no-improve|regressed`.
4. **Verify immediately in the same pass:**
   - New bus **expect** (predicted scores after the experiment; may still be imperfect).
   - **Act + capture** on the same scenario(s).
   - **Outcome** judged scores — these replace the pre-reduce cells for this iteration's final scores when better.
5. If verify scores did **not** improve: record in `reduction.md`, keep or revert based on safety, then **immediately take the next finding** in the same pass if it is independent (do not wait for the next pass to apply a known fix).
6. When on a delivery branch: incremental git commit for this checkpoint (`references/pr-delivery.md`).

### Derive → implement (non-negotiable)

| Agent state | Required action |
|---|---|
| You know the file/script/message to change | **Edit it this pass** |
| You know “user should run X” | Prefer **make X automatic**, or **run X** if safe/local, or **print X as the only exit path** — not “document for later” |
| Finding lists “Smallest reduction: …” | That reduction is the **work item**, not optional backlog |
| Prior pass left residual with clear next step | **Next pass implements it** — residual is not a trophy |

Writing a good analysis without landing the change is a **failed reduce**.

### Opt-out (`--report-only` / `--no-reduce` / `OPTIMIZEXP_REPORT_ONLY=1`)

Document the finding and a concrete fix plan in `reduction.md` only — **no code changes**. Summarize that the run was report-only.

### Hard constraints

- Never "reduce" by gaming scores without changing the experience.
- Do not invent fake evidence.
- Prefer one primary experiment per pass; **also ship** other independent **S**-effort fixes in the same pass when they do not thrash the same surface (list all in `reduction.md`).

## 7b. Anti-stall (do not stop early)

These are **invalid** stop reasons:

| Invalid excuse | Do this instead |
|---|---|
| “Needs `pnpm install` / node_modules” | Implement cold-path messaging **and/or** run install when allowed **and/or** offline entrypoints; then re-measure happy path |
| “Env issue / cloud agent has no deps” | Product code + harness still fixable; install if policy allows; expand offline paths |
| “I’ll leave residual for improve/sdlc” | If you already derived the fix, **you** own implementing it in this run |
| “Scores flat so plateau” while findings have S/M reductions | **Not plateau** — keep reducing |
| “Messaging fixed; friction 2 is good enough” | Keep going if happy-path still fails for the persona or uncertainty remains |
| “Report-only vibe” without `--report-only` | Apply experiments |

**True external block** (allowed in `summary.md` → Blocked only): missing secrets the user did not provide, network forbidden by policy, user explicitly forbade installs/mutations, safety rule. Every blocked item needs `blockedBecause` + what would unblock it.

### Plateau definition (strict)

Numeric plateau (`metric_total` and `metric_max` not improved vs previous pass) is **necessary but not sufficient**.

Plateau **only if both**:

1. Scores did not improve vs previous pass
2. **`implementableFindingsRemaining === 0`** — no finding with Effort S/M and a concrete in-repo (or safe local setup) reduction left unapplied

When calling `should-stop`, pass implementable backlog:

```bash
node --import tsx …/review-loop.mts --mode should-stop \
  --run <id> --iteration <passIndex> --scores c.json --prev-scores p.json \
  --implementable-findings <N>   # 0 only when backlog empty
```

If N > 0, harness **must not** return plateau stop (continue).

## 8. PR checkpoint (per pass)

When the user wants PRs (or already asked for optimizexp PR delivery):

1. Prefer **stacked PR** for this iteration if `gh stack` / Graphite is available.
2. Push incremental commits.
3. Post evidence: `harness/post-pr-evidence.mts --feature <id>` (splits/compresses when oversized).

## 9. Stop conditions

### Within a cycle (after each review iteration)

Stop the **cycle** when **any** is true:

1. **True plateau** (§ 7b): scores flat **and** zero implementable findings remaining  
2. User says stop  
3. **Only** true external blocks remain — list under `summary.md` → Blocked (with `blockedBecause`)  
4. Safety boundary hit  

**Forbidden stops (within a cycle):**

- Invented max review-iteration budget / “we did N review iterations so done”  
- Misusing **`--passes`** as “only N reduce steps”  
- “Good enough after N experiments” while S/M findings remain  
- Flat scores while implementable S/M findings remain  

**Do not stop** because you ran out of ideas while residual still names a file-level fix. If stuck, take the next surface/persona cell with the worst `metric_max` and reduce that.

### Across outer cycles (`passes`)

After a cycle ends in **true plateau**:

1. Record final cell scores for the cycle (`metric_total`, `metric_max`).  
2. **If metrics all zero** (`metric_total === 0` and `metric_max === 0`) → **invocation complete** (`stopReason: metrics-zero`).  
3. Else **re-baseline / re-survey** for new implementable S/M findings after prior reductions.  
4. **If none** → **invocation complete** (`stopReason: irreducible` — impossible to reduce further).  
5. **If some** and `passes` is **infinite** → start next cycle.  
6. **If some** and `passes` is finite **N** and `cyclesCompleted < N` → start next cycle; if `cyclesCompleted === N` → complete even if metrics > 0 (`stopReason: passes-cap`).  

If a cycle ends in user/safety/blocked, stop the invocation and document.

Use `--report-only` only when the user wants measure-only.

Update `scope.json`:

- `passesCompleted` each **review iteration** (bookkeeping; not a cap)  
- `cyclesCompleted` each finished outer cycle  
- `stopReason` when the invocation ends  

Write `summary.md`:

- Final scores vs baseline (and per-cycle when multiple cycles ran)  
- `passes` / `passesLabel` / `cyclesCompleted` / review iterations / why stopped (`metrics-zero` | `irreducible` | `passes-cap` | `blocked` | `user` | `safety`)  
- Experiments applied (every review iteration must list landed files if not report-only)  
- Bus corrections applied (count of `correctedFrom` expects)  
- Top remaining debt — **only** true external blocks or L-effort after S/M exhausted  
- Recommended next owners only for items this run could not legally touch

## Host workflows vs cross-agent

| Host supports workflows? | Use |
|---|---|
| Yes (Claude Code, Grok, etc.) | `workflows/<host>/review.*` generated per `workflow-generation.md` |
| No / unknown | `workflows/cross-agent/` deterministic runner template |

Both paths **must** still write the agent bus **and** feature evidence; workflows orchestrate the loop, they do not replace either.
