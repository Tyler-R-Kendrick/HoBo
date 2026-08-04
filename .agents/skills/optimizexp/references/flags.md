---
type: Agent Skill Reference
title: "OptimizeXP flags"
description: "Grammar for experiences, persona seeds, feature seeds, and run scope resolution."
tags: [hobo, optimizexp, flags, ux, dx, ax, persona, feature]
timestamp: 2026-07-30T00:00:00Z
---

# Experience flags

## Init (bootstrap)

```text
--init
--init --dry-run
--init --force
--init --experiences dx,ax
```

| Form | Meaning |
|---|---|
| **`--init`** | Traverse the repo; create product-aligned **UX/DX/AX personas** and **feature/scenario** scaffolds. See `references/init.md`. |
| (with `--init`) `--dry-run` | Print discovery plans only |
| (with `--init`) `--force` | Overwrite existing generated persona/feature ids |

### Bare run (no flags)

```text
/optimizexp
```

1. **Detect** whether bootstrap is required (`init.mts --mode needs-init`).
2. **If yes** → run init for **all** experiences (`ux`,`dx`,`ax`).
3. **Then** run the review loop with **all** experiences enabled (same as default experience set).

Needs-init is true when any of: zero personas; zero features; no product bootstrap (`product-*` personas / `init-report.json`) and sparse features. See `references/init.md` § Auto-init.

Explicit flags (`--dx`, `--persona`, `--feature`, …) **skip** auto-init unless the tree is empty of personas **and** features (still bootstraps then, so review can run).

## Project flags (multi-project repos)

Optional. Default: **all projects** in the workspace.

```text
--projects all
--all-projects
--project site
--projects site,cli,hobo
--projects hello-bindle
```

| Form | Meaning |
|---|---|
| **(omitted)** / `--projects all` / `--all-projects` | Evaluate **every** discovered project (default). |
| `--project <id>` | Single project (repeatable / comma-list also accepted via `--projects`). |
| `--projects a,b,c` | Explicit project id list (exclusive). |

### What is a “project”?

An evaluable product unit discovered from the tree, for example:

| Id examples | Source |
|---|---|
| `root` | Repo root (always) |
| `site` | `site/` public app |
| `cli`, `hobo`, `mcp` | Product packages under `packages/` |
| `hello-bindle`, … | `examples/*` |
| draft MVP slugs | `src/draft/projects/*` |

List them:

```bash
node --import tsx .agents/skills/optimizexp/harness/init.mts --mode list-projects
```

### How scoping applies

| Phase | Effect of `--projects` |
|---|---|
| **init** | Seed plans for selected projects; **write** single non-root project content to `<project>/.optimizexp/`; multi/root → global; ensure **config.json** |
| **persona / feature generate** | Single non-root project → write under that project's `.optimizexp/`; all/multi/root → **global** `.optimizexp/` |
| **read / resolve** | Always merge **global + selected project** trees; project-local **id shadows** global; apply **config prefer/exclude** |
| **review** | Personas/features from merged scopes; config defaults for experiences/caps when flags omit; CLI wins |
| **bus / runs / backlog** | Always **global** `.optimizexp/` (orchestration is monorepo-wide) |

Repo defaults live in **`.optimizexp/config.json`** and **`<project>/.optimizexp/config.json`** (`references/config.md`).

```text
/optimizexp --init --projects site          # site-tagged content → site/.optimizexp/
/optimizexp --projects site,cli             # read global + site + cli scopes
/optimizexp --project root --dx             # monorepo DX only (global tree)
/optimizexp --persona "…" --project site   # write site/.optimizexp/personas/
/optimizexp                                 # all-projects + all experiences (after auto-init)
```

## Defaults

| Flag set | Experiences | Projects |
|---|---|---|
| (none) / after auto-init | **`ux`, `dx`, `ax`** | **`all-projects`** |

## Include-only forms

```text
--ux
--dx
--ax
--only ux
--only ux,dx
--only ux dx ax
ux dx          # bare experience tokens after skill name
```

Bare tokens recognized: `ux`, `dx`, `ax` (case-insensitive). Other words are scope hints — **except** values of `--persona` / `--feature` (free-text seeds).

## Exclude forms

```text
--exclude ax
--exclude ux,dx
--no-ux
--no-dx
--no-ax
```

Exclude wins over include.

---

## Persona flags

### Generate persona from seed (`--persona`)

```text
--persona "A junior frontend engineer who panics at monorepo gates"
--persona-seed "…"
--persona-file path/to/seed.txt
--persona-id junior-frontend
```

| Form | Meaning |
|---|---|
| `--persona "<seed>"` | Free-text seed → rewrite → formal persona under **write scope** (global or `<project>/.optimizexp/personas/`) |
| `--persona-seed` / `--persona-file` | Same seed input |
| `--persona-id <slug>` | Optional id for **the next** `--persona` seed (pair order: id then seed, or seed then id in same invocation) |
| `--project <id>` with `--persona` | Single non-root project → write to that project's `.optimizexp/personas/` |

**Repeatable.** Seed is never the raw review system prompt. See `references/personas.md`.

### Select existing personas

```text
--personas developer,end-user
--use-personas developer
```

Ids only. Not free text.

### Max personas

```text
--max-personas 3
```

---

## Feature flags

### Generate feature (Gherkin folder) from seed (`--feature`)

```text
--feature "Staged agent check after a skill edit gives clear next steps"
--feature-seed "…"
--feature-file path/to/journey-seed.txt
--feature-id agent-check-staged
--driver cli
```

| Form | Meaning |
|---|---|
| `--feature "<seed>"` | Free-text **journey seed**. Rewrite into **write-scope** `features/<id>/` (global or project-local) with formal `feature.json` + **one Gherkin file per targeted persona**. |
| `--feature-seed` / `--feature-file` | Same seed input |
| `--feature-id <slug>` | Optional folder/id; else derived from seed |
| `--driver cli\|tui\|web\|native\|mixed` | Preferred capture driver for `feature.json` |
| `--project <id>` with `--feature` | Single non-root → `<project>/.optimizexp/features/<id>/` |

**Repeatable:** multiple `--feature` seeds → multiple feature folders.

### Who gets a Gherkin file? (persona targeting)

Feature generation **reuses the resolved persona set** (see Resolution algorithm). Net effect:

| Invocation | Personas targeted for `.feature` files |
|---|---|
| `--feature "…"` only | **All personas** whose `experiences` intersect the resolved experience set (default all three → nearly all on-disk personas) |
| `--feature "…"` + `--dx` | Personas that include `dx` (and still “all” of those — not a single default persona) |
| `--feature "…"` + `--personas developer,coding-agent` | **Only** those ids |
| `--feature "…"` + `--persona "new SRE seed"` (no `--personas`) | **Only** the persona(s) generated this run |
| `--feature "…"` + `--persona "…"` + `--personas developer` | Union: generated id(s) **plus** explicit list if both present — prefer documenting: if `--personas` is set it **wins** as the exclusive list (generated must already be included or listed). **Rule: `--personas` exclusive when present; else generated-only when any generated; else experience intersection.** |

Per targeted persona, write:

```text
.optimizexp/features/<feature-id>/<feature-id>-<persona-id>.feature
# or
<project>/.optimizexp/features/<feature-id>/<feature-id>-<persona-id>.feature
```

Shared per feature folder: `feature.json`, `README.md`, `SEED.md`, `evidence/` (one tree for all persona files).

Do **not** collapse multi-persona generation into a single untagged `.feature` file. Scenarios stay persona-specific so evidence and scorecards stay attributable.

### Select existing features for a run (optional)

```text
--features agent-check-staged,site-nav
--use-features agent-check-staged
```

When omitted, the run may use features listed in scope or discovered under `.optimizexp/features/` that match selected experiences/personas.

---

## Passes (outer completion cycles)

```text
--passes infinite     # default
--passes 3            # optional finite cap
passes: infinite      # machine/config form
passes: 3
```

| Field / form | Default | Meaning |
|---|---|---|
| **`--passes infinite`** / `passes: "infinite"` | **infinite** | Keep running **completion cycles** until stop rule below. |
| **`--passes N`** / `passes: N` (integer ≥ 1) | — | Cap at **N** outer cycles (each cycle still to true plateau). |

Accepts `infinite` / `inf` / `∞` / `-1` / `0` / omitted → **infinite**. Positive integers → finite cap.

### Semantics

1. **One cycle** = full review loop until **true plateau** (flat scores **and** implementableFindingsRemaining = 0), or user/safety/true external block.  
2. **Within a cycle** there is **no** max review-iteration budget (no `--iterations`). Keep reducing until findings are gone.  
3. After a cycle plateaus, **re-baseline / re-survey** (prior fixes may reveal new findings).  
4. **Default infinite** — the invocation continues through **harm_reduce → delight_maximize** until **`pareto-equilibrium`** (see `equilibrium.md`): no admissible S/M experiment improves delight without increasing harm or breaching cognitive thresholds, and no S/M harm reductions remain.  
5. Harm **metrics-zero** or **irreducible** only **switch regime** to delight — they are **not** invocation terminals.  
6. **Finite `passes: N`:** cap **harm_reduce** cycles; still enter delight unless `--no-delight`.  
7. **`--passes` is not a review-iteration early-stop.** Never treat it as “run N reduce steps then stop.”  

Env alias: `OPTIMIZEXP_PASSES=infinite|N` (optional; CLI/flag wins when both set).

## Delight regime + survey (after harm floor)

```text
--delight-passes infinite   # default in delight regime
--delight-passes 2
--no-delight
--harm-only                 # alias of --no-delight
--no-survey
```

| Form | Default | Meaning |
|---|---|---|
| **`--delight-passes infinite\|N`** | **infinite** | Cap delight-maximize cycles; default until Pareto equilibrium |
| **`--no-delight`** / **`--harm-only`** | off | Stop after harm floor (legacy early exit — opt out of equilibrium) |
| **`--no-survey`** | off | Skip persona survey + survey-driven backlog |

Env: `OPTIMIZEXP_DELIGHT_PASSES`, `OPTIMIZEXP_NO_DELIGHT=1`, `OPTIMIZEXP_NO_SURVEY=1`.

`scope.json` should record:

```json
{
  "stopPolicy": "infinite-until-pareto-equilibrium",
  "regime": "delight_maximize",
  "delightPasses": null,
  "delightPassesLabel": "infinite",
  "delightCyclesCompleted": 0,
  "noDelight": false,
  "noSurvey": false,
  "surveyCompleted": false
}
```

## Stop policy (per cycle; no review-iteration budget)

There is **no** `--iterations` / `--max-iterations` / `--min-iterations` flag.

Within each outer cycle the review loop **applies reduce experiments** and continues until:

1. **True plateau** — scores flat **and** implementableFindingsRemaining = 0  
2. User stop  
3. Safety  
4. Only true external blocks remain  

| Form | Meaning |
|---|---|
| **`--report-only`** / **`--no-reduce`** | Measure and document only; **do not** apply experiments. |
| `OPTIMIZEXP_REPORT_ONLY=1` | Same as `--report-only`. |

```text
/optimizexp --dx                         # passes=infinite → harm then delight → pareto-equilibrium
/optimizexp --ax --passes 3              # at most three harm cycles; still delight after
/optimizexp --dx --report-only           # measure only
/optimizexp --dx --no-delight            # stop after harm floor (opt-out)
```

`scope.json` records:

```json
{
  "reportOnly": false,
  "passes": null,
  "passesLabel": "infinite",
  "cyclesCompleted": 0,
  "passesCompleted": 0,
  "status": "running",
  "regime": "harm_reduce",
  "stopPolicy": "infinite-until-pareto-equilibrium",
  "outerCycles": "passes"
}
```

- `passes` — `null` = infinite; positive int = finite outer-cycle cap  
- `passesLabel` — `"infinite"` or `"N"` for humans  
- `cyclesCompleted` — outer cycles finished to plateau (or terminal stop)  
- `passesCompleted` — **review iterations** completed (historical field name; bookkeeping only, not a cap)  
- `status` — `running` until `mark-complete`; never claim done while `running`  
- Invocation complete requires `assert-complete` ok + `mark-complete` (not should-stop plateau)

---

## Resolution algorithm (order matters)

0. **Bare (no flags):** `needs-init` → if true, `init.mts` (all experiences, **all projects**) → then continue to review with `{ux,dx,ax}` + all-projects.
1. **If `--init` only:** run `harness/init.mts` with optional `--projects`; write `.optimizexp/INIT.md` + `init-report.json`; **stop** (unless user also requested review).
2. **Projects** — default `all-projects`; if `--project(s)` set, resolve ids via `list-projects` (unknown ids → error).
3. **Experiences** — default `{ux,dx,ax}`; apply include-only; apply excludes; empty → stop and ask.
4. **Persona generation** — for each `--persona` / seed file, rewrite → write-scope `personas/<id>.md` (global or project); collect `generatedPersonaIds`.
5. **Persona selection** for the rest of the run (review **and** feature generation) — scan **global + selected project** `.optimizexp/personas/` (project shadows global on id):
   1. If `--personas` / `--use-personas` → **exactly those ids** (must exist after step 4).
   2. Else if `generatedPersonaIds` non-empty → **exactly those ids**.
   3. Else → **all** merged-scope personas whose formal frontmatter **`experiences` ∩ step-3 experiences ≠ ∅** (no fall-back to all personas; invalid/empty `experiences` excluded).
   4. Apply `--max-personas` (priority then id).
6. **Feature generation** — for each `--feature` / seed file:
   1. Derive `feature-id` (`--feature-id` or from seed).
   2. Create/update write-scope `features/<id>/` (global vs `<project>/.optimizexp/`).
   3. For **each id in the persona selection**, write/overwrite `<id>-<persona>.feature`.
   4. Write `feature.json` with `personas`, `projects`, `scope`, seed digest.
   5. **Never delete** `evidence/` when regenerating Gherkin.
7. **Feature selection for review** — if `--features` set, those ids (resolved via global+project search); else features under merged scopes whose `projects` intersects selection (untagged ≈ `root`).
8. **Passes** — default `passes = infinite`; parse `--passes infinite|N` / `OPTIMIZEXP_PASSES`.  
9. **Delight / survey** — parse `--delight-passes`, `--no-delight`, `--no-survey` (and env aliases).  
10. **Stop policy** — per cycle: true plateau = cycleStop only; outer infinite until **pareto-equilibrium** via delight (or finite N / `--no-delight`); survey/backlog default on; no review-iteration budget; `--report-only` disables reduce/uplift apply; **assert-complete** required before claiming done.  
11. Echo resolved set (experiences, projects, personas, features, passes, delight, survey, reportOnly).

Harness:

```bash
# which personas would a feature hit?
node --import tsx .agents/skills/optimizexp/harness/generate-feature.mts \
  --mode resolve-personas --experiences dx --personas developer

# scaffold feature for those personas
node --import tsx .agents/skills/optimizexp/harness/generate-feature.mts \
  --seed "Staged agent check feedback" --id agent-check-staged \
  --experiences dx --personas developer,coding-agent
```

---

## Composing examples

```text
# All personas (intersecting default ux+dx+ax) each get a .feature file
/optimizexp --feature "Checkout empty cart is calm and clear"

# Only dx personas
/optimizexp --feature "Staged agent check is narrow and actionable" --dx

# Only two explicit personas
/optimizexp --feature "Staged agent check…" --personas developer,coding-agent

# Generate a persona, then a feature only for them
/optimizexp --persona "Junior FE who panics at monorepo gates" --persona-id junior-frontend \
  --feature "First green CI after a one-line CSS change" --dx

# Feature + full review loop
/optimizexp --feature "…" --personas developer --dx
```

---

## Machine form (`scope.json`)

```json
{
  "experiences": ["dx"],
  "projects": ["all"],
  "personas": ["developer", "coding-agent"],
  "personaResolution": "explicit --personas",
  "generatedPersonas": [],
  "generatedFeatures": [
    {
      "id": "staged-agent-check-feedback",
      "seed": "Staged agent check is narrow and actionable",
      "path": ".optimizexp/features/staged-agent-check-feedback",
      "projects": ["root"],
      "personaFiles": [
        "staged-agent-check-feedback-developer.feature",
        "staged-agent-check-feedback-coding-agent.feature"
      ]
    }
  ],
  "surfaces": [],
  "reportOnly": false,
  "passes": null,
  "passesLabel": "infinite",
  "cyclesCompleted": 0,
  "passesCompleted": 0,
  "stopPolicy": "infinite-until-pareto-equilibrium",
  "status": "running",
  "regime": "harm_reduce",
  "regimesEntered": ["harm_reduce"],
  "outerCycles": "passes",
  "hostAgent": "claude-code"
}
```
