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
| **init** | Only seed personas/features tagged for selected projects |
| **feature generate** | Writes `feature.json` → `projects: [...]` |
| **review** | Only exercise features whose `projects` intersects selection (untagged ≈ `root`) |
| **personas** | Prefer personas whose experiences match; project tags on personas are advisory |

```text
/optimizexp --init --projects site          # UX-heavy bootstrap for site only
/optimizexp --projects site,cli             # review features for site + cli
/optimizexp --project root --dx             # monorepo DX only
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
| `--persona "<seed>"` | Free-text seed → rewrite → formal `.optimizexp/personas/<id>.md` |
| `--persona-seed` / `--persona-file` | Same seed input |
| `--persona-id <slug>` | Optional id for **the next** `--persona` seed (pair order: id then seed, or seed then id in same invocation) |

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
| `--feature "<seed>"` | Free-text **journey seed**. Rewrite into `.optimizexp/features/<id>/` with formal `feature.json` + **one Gherkin file per targeted persona**. |
| `--feature-seed` / `--feature-file` | Same seed input |
| `--feature-id <slug>` | Optional folder/id; else derived from seed |
| `--driver cli\|tui\|web\|native\|mixed` | Preferred capture driver for `feature.json` |

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
```

Shared: `feature.json`, `README.md`, `SEED.md`, `evidence/` (one tree for all persona files).

Do **not** collapse multi-persona generation into a single untagged `.feature` file. Scenarios stay persona-specific so evidence and scorecards stay attributable.

### Select existing features for a run (optional)

```text
--features agent-check-staged,site-nav
--use-features agent-check-staged
```

When omitted, the run may use features listed in scope or discovered under `.optimizexp/features/` that match selected experiences/personas.

---

## Stop policy (no iterations flag)

There is **no** `--iterations` / `--max-iterations` / `--min-iterations` flag.

The review loop **applies reduce experiments** and continues until:

1. **True plateau** — scores flat **and** implementableFindingsRemaining = 0  
2. User stop  
3. Safety  
4. Only true external blocks remain  

| Form | Meaning |
|---|---|
| **`--report-only`** / **`--no-reduce`** | Measure and document only; **do not** apply experiments. |
| `OPTIMIZEXP_REPORT_ONLY=1` | Same as `--report-only`. |

```text
/optimizexp --dx                         # until true plateau
/optimizexp --dx --report-only           # measure only
```

`scope.json` records:

```json
{
  "reportOnly": false,
  "passesCompleted": 0,
  "stopPolicy": "true-plateau-only"
}
```

---

## Resolution algorithm (order matters)

0. **Bare (no flags):** `needs-init` → if true, `init.mts` (all experiences, **all projects**) → then continue to review with `{ux,dx,ax}` + all-projects.
1. **If `--init` only:** run `harness/init.mts` with optional `--projects`; write `.optimizexp/INIT.md` + `init-report.json`; **stop** (unless user also requested review).
2. **Projects** — default `all-projects`; if `--project(s)` set, resolve ids via `list-projects` (unknown ids → error).
3. **Experiences** — default `{ux,dx,ax}`; apply include-only; apply excludes; empty → stop and ask.
4. **Persona generation** — for each `--persona` / seed file, rewrite → `personas/<id>.md`; collect `generatedPersonaIds`.
5. **Persona selection** for the rest of the run (review **and** feature generation):
   1. If `--personas` / `--use-personas` → **exactly those ids** (must exist after step 4).
   2. Else if `generatedPersonaIds` non-empty → **exactly those ids**.
   3. Else → **all** on-disk personas whose `experiences` intersect step 3 (if none intersect, fall back to all on-disk personas).
   4. Apply `--max-personas` (priority then id).
6. **Feature generation** — for each `--feature` / seed file (tag with selected projects):
   1. Derive `feature-id` (`--feature-id` or from seed).
   2. Create/update `.optimizexp/features/<id>/`.
   3. For **each id in the persona selection**, write/overwrite `<id>-<persona>.feature`.
   4. Write `feature.json` with `personas`, `projects`, seed digest.
   5. **Never delete** `evidence/` when regenerating Gherkin.
7. **Feature selection for review** — if `--features` set, those ids; else features under `.optimizexp/features/` whose `projects` intersects project selection (untagged ≈ `root`).
8. **Stop policy** — true plateau only (plus user/safety/blocked); no iterations budget; `--report-only` disables reduce experiments.
9. Echo resolved set (experiences, projects, personas, features, reportOnly).

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
  "passesCompleted": 0,
  "stopPolicy": "true-plateau-only",
  "hostAgent": "claude-code"
}
```
