# OptimizeXP (repo config)

Repo-local configuration for the **optimizexp** agent skill.

| Path | Role |
|---|---|
| `personas/*.md` | Persona instruction prompts for review workflows |
| `features/<slug>/` | Feature folders: per-persona Gherkin, `feature.json`, `evidence/` |
| `features/<slug>/<slug>-<persona>.feature` | One Gherkin file per targeted persona |
| `features/<slug>/evidence/<scenario>/` | **One** primary recording per scenario (overwritten on re-run) |
| `bus/entries/` | Append-only bus: **expect / act / outcome** JSON with formal metric scorecards |
| `runs/<run-id>/` | Per-run scope, scores, iterations, summary |

Skill (progressive disclosure + harness + host workflows):

- `.agents/skills/optimizexp/` (Cursor / Codex / shared)
- `.claude/skills/optimizexp/` (Claude Code mirror — byte-identical)

**AX (`--ax`) sectioned refs** (load `references/ax/index.md` first): specs · MCP · agent-skills ·
harness-clis · model-routing · token-optimization · agents-md · agents-config · hooks-plugins · auth.

## Quick start

```text
/optimizexp                        # needs-init? → init if needed → review+reduce ALL ux+dx+ax
/optimizexp --init                 # bootstrap only
/optimizexp --init --dry-run
/optimizexp --dx                   # measure→reduce→verify until true plateau
/optimizexp --dx --report-only     # measure only, no code experiments
/optimizexp --personas product-app-developer --features narrow-local-validation
```

**Default behavior:** each persona review pass **applies a reduce experiment** (smallest safe fix for the top finding), then re-captures evidence and re-scores. Opt out with `--report-only` / `--no-reduce`.

**Anti-stall:** if the agent can name a concrete fix, it must implement it and continue — not stop on “needs install,” “env,” or flat scores with an open S/M backlog. True plateau = flat scores **and** zero implementable findings. **There is no iterations flag.**

### Seeds vs selection

| Flag | Meaning |
|---|---|
| **(none)** | Auto-detect init need; then review **all** experiences + **all projects** |
| **`--init`** | Traverse repo → UX/DX/AX personas + feature/scenarios from product signals |
| **`--projects all`** / **`--project site`** | Multi-project scope (default **all-projects**) |
| `--persona "…"` | Seed → rewrite → formal `personas/<id>.md` (never raw as system prompt) |
| `--personas a,b` | Select existing persona ids (**exclusive** when set) for the run **and** feature fan-out |
| `--feature "…"` | Journey seed → `features/<id>/` with **one `.feature` per resolved persona** |
| (no persona flags) | Feature generation targets **all** personas intersecting experiences |

```bash
# does bare optimizexp need init?
node --import tsx .agents/skills/optimizexp/harness/init.mts --mode needs-init

# list multi-project ids
node --import tsx .agents/skills/optimizexp/harness/init.mts --mode list-projects

# bootstrap from product repo (all projects, or scoped)
node --import tsx .agents/skills/optimizexp/harness/init.mts
node --import tsx .agents/skills/optimizexp/harness/init.mts --projects site,cli
node --import tsx .agents/skills/optimizexp/harness/init.mts --dry-run

# generate a persona from a seed
node --import tsx .agents/skills/optimizexp/harness/generate-persona.mts \
  --seed "SRE who lives in Grafana and hates log archaeology" --id grafana-sre

# generate a feature (Gherkin per persona + bindings/tests)
node --import tsx .agents/skills/optimizexp/harness/generate-feature.mts \
  --seed "Staged agent check is narrow and actionable" --id agent-check-staged \
  --experiences dx --personas developer,coding-agent

# re-wire implementations from code discovery
node --import tsx .agents/skills/optimizexp/harness/generate-feature.mts \
  --mode implement --id agent-check-staged

# smoke bindings
pnpm run test:file .optimizexp/features/agent-check-staged/test/agent-check-staged.bindings.test.ts

# who would be targeted?
node --import tsx .agents/skills/optimizexp/harness/generate-feature.mts \
  --mode resolve-personas --experiences dx

# capture / overwrite evidence for a scenario
node --import tsx .agents/skills/optimizexp/harness/capture-evidence.mts \
  --mode capture --feature agent-check-staged --scenario "…" --driver cli --command 'pnpm -v'

# after a PR exists: post evidence comments (size-aware)
node --import tsx .agents/skills/optimizexp/harness/post-pr-evidence.mts --feature agent-check-staged
```

## Metric scorecards (expect / act / outcome)

Every bus phase emits formal **`scores`** against **harms**, **friction**, and **uncertainty** (0–5):

| Phase | Role | Meaning |
|---|---|---|
| expect | `predicted` | Forecast if the expectation holds |
| act | `observed` | First-pass scores from evidence/capture |
| outcome | `judged` | Final persona scores + `comparison` deltas |

Iteration rollups use **judged** outcomes only. See skill `references/metric-scorecard.md`.

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --mode validate-bus
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --mode aggregate-bus --run <runId>
```

## Evidence policy

1. Prefer **video** for visual surfaces (web / native / rich TUI).
2. Else keyframe screenshots → stitch to video/GIF (`--mode stitch`).
3. CLI: transcript + terminal size (cols×rows).
4. **One** `primary.*` per scenario; new runs **overwrite**.
5. Bus outcomes link to evidence paths; they do not embed binaries.

## PR delivery

- Incremental commits throughout each iteration.
- Prefer **stacked PRs per iteration** when `gh stack` (or Graphite) is available.
- Post evidence to the PR; compress/split when oversized.

See skill references: `flags.md`, `personas.md`, `features.md`, `evidence.md`, `harness.md`, `pr-delivery.md`.

## Adding a persona

Prefer `/optimizexp --persona "seed"` or `generate-persona.mts`. Keep `schemaVersion: 1` and required sections (skill `references/personas.md`).

## Git

Commit **personas**, **features** (including current evidence), and skill files.  
`bus/entries/` and ephemeral `runs/` may be committed as fixtures or left local.
