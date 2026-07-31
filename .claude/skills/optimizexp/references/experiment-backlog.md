---
type: Agent Skill Reference
title: "OptimizeXP experiment backlog"
description: "Rank persona feature-requests and positive-metric gaps into a prioritized experiment backlog for auto improvement."
tags: [hobo, optimizexp, backlog, experiments, prioritization]
timestamp: 2026-07-31T00:00:00Z
---

# Experiment backlog

After Phase 1 (and during Phase 2), OptimizeXP maintains a **ranked backlog of uplift experiments** derived from:

1. **Persona survey** feature requests (`persona-survey.md`)  
2. **Low positive-metric cells** (excitement / easeOfUse / perceivedOptimality ≤ 3)  
3. Residual **feelings** / desirability from bus outcomes (supporting signal)  
4. Optional agent-authored uplift ideas that cite evidence

These are **pseudo feature requests** until an owner promotes them (sdlc / improve / human). The skill **may auto-apply** S/M items during Phase 2; it **must not** invent Linear issues without the user/sdlc flow.

## Locations

```text
.optimizexp/runs/<run-id>/backlog.json     # this run's ranked list + statuses
.optimizexp/backlog/experiments.json       # global merge (append/update by id)
.optimizexp/backlog/README.md              # human pointer (optional)
```

## Experiment item schema

```json
{
  "id": "fr-doctor-gbrain-next-step",
  "title": "Doctor gbrain warn prints zero-key next command",
  "problem": "…",
  "desiredOutcome": "…",
  "hypothesis": "If doctor prints the exact next command, ease and optimality rise.",
  "source": "survey",
  "sourceRefs": [
    ".optimizexp/runs/20260731-all-exp/survey/product-app-developer.json"
  ],
  "personas": ["product-app-developer"],
  "featureIds": ["cli-help-and-doctor"],
  "surfaces": ["pnpm run doctor"],
  "experiences": ["dx", "ax"],
  "impactOn": {
    "excitement": 1,
    "easeOfUse": 1,
    "perceivedOptimality": 2
  },
  "effort": "S",
  "priorityScore": 42,
  "status": "ready",
  "antiGoals": ["never auto-install gbrain"],
  "smallestExperiment": "Add one remediation line under the gbrain PATH warn in doctor.ts",
  "createdAt": "2026-07-31T16:05:00.000Z",
  "updatedAt": "2026-07-31T16:05:00.000Z",
  "runId": "20260731-all-exp"
}
```

### Status

| Status | Meaning |
|---|---|
| `ready` | Ranked; eligible for Phase 2 auto-apply if S/M |
| `in_progress` | Experiment applied this pass; awaiting verify |
| `done` | Verified; positive metrics improved or accepted |
| `no_improve` | Tried; scores did not rise — park or revise |
| `blocked` | True external block (`blockedBecause` required) |
| `deferred` | L-effort or needs product decision |
| `wontfix` | Conflicts with antiGoals / safety / user |

## Priority score

```text
priorityScore =
  10 * (impactOn.excitement + impactOn.easeOfUse + impactOn.perceivedOptimality)
  + 5 * (5 - minPositiveOnTargetCells)   # worse cells first
  + effortBonus                          # S=+15, M=+5, L=-20
  + multiPersonaBonus                    # +3 per additional distinct persona
```

`impactOn` values are **0–2 expected lifts** (not 0–5 absolute scores).  
Harness `survey.mts --mode rank-backlog` recomputes scores deterministically.

**Sort key:** `priorityScore` desc, then `effort` S→M→L, then `id` asc.

## Auto-apply policy (delight_maximize)

When delight regime is active and not `--report-only`:

1. Take highest `ready` item with `effort` **S** or **M** that is **Pareto-admissible** (`equilibrium.md`).  
2. Implement **smallestExperiment** (derive→implement).  
3. Verify: delight improved; **harm not increased**; **no cognitive threshold breaches** → `done` or `no_improve` / `wontfix` with `rejectedBecause`.  
4. Never auto-apply `L` without user/sdlc.  
5. Never violate `antiGoals`, safety, or inverted-U past-peak doubles.

Harm_reduce S/M findings take precedence if primary regresses (regime switch back).

## Global merge

```bash
node --import tsx .agents/skills/optimizexp/harness/survey.mts \
  --mode rank-backlog --run <runId> --global
```

Merge rules:

- Same `id` → keep higher `priorityScore`, union personas/featureIds, newest `updatedAt`  
- Preserve `done` / `wontfix` unless force  
- Cap global file growth: keep top 200 by score + all `ready`/`in_progress` from last 30 days

## Run summary section

Every `summary.md` that ran a survey includes:

```markdown
## Persona survey + experiment backlog

- Personas polled: N
- Positive: mean / min / gap_max
- Top experiments:
  1. [S] title (priorityScore) — status
  2. …
- Global backlog: `.optimizexp/backlog/experiments.json`
```

## Relation to features

A backlog item **may** later become:

- a new `--feature "…"` seed  
- an update to an existing feature scenario  
- an sdlc one-shot issue  

Until then it stays under `.optimizexp/backlog/` as optimizexp data.

## Related

- [persona-survey.md](persona-survey.md)  
- [positive-metrics.md](positive-metrics.md)  
- [review-loop.md](review-loop.md)  
