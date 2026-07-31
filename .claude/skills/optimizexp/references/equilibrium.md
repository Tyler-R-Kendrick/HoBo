---
type: Agent Skill Reference
title: "OptimizeXP multi-objective equilibrium"
description: "Infinite optimizexp loop: harm reduce then delight maximize under non-regression and cognitive-threshold constraints until Pareto equilibrium."
tags: [hobo, optimizexp, equilibrium, pareto, multi-objective, yerkes-dodson, kano]
timestamp: 2026-07-31T00:00:00Z
---

# Multi-objective equilibrium (canonical stop for infinite runs)

OptimizeXP is **not** “drive harms to floor and stop.”  
Default infinite invocation stops only at **Pareto equilibrium** (or user / safety / true external block / finite pass caps).

## Disciplines synthesized

| Discipline | What we take |
|---|---|
| **Multi-objective optimization / Pareto** | No free lunch: a move is admissible only if it improves at least one objective without worsening another **constrained** objective |
| **Human-centered design (ISO 9241-210)** | Iterate measure→design→evaluate with users (personas stand in with evidence) |
| **Kano model** | Basics (must-be) vs performance vs delighters — Phase 1 protects basics; Phase 2 seeks delighters **without** breaking must-bes |
| **Yerkes–Dodson (inverted-U)** | Arousal/novelty/feature density has a peak; beyond the peak, more “delight features” **reduce** performance and raise cognitive load |
| **Cognitive load (Sweller) + COGA** | Extraneous load, choice overload, clutter are first-class constraints — not vibes |
| **Jobs-to-be-done + segmentation** | Personas carry KYC demographic/psychographic models so delight is scored by intended market segments |

User intuition of a “bottom of the equilibrium parabolic curve” maps to: **the peak of the inverted-U for this persona × surface**, on the **Pareto frontier** of (min harm, max delight) under cognitive thresholds.

## Objectives

| Objective | Direction | Metrics |
|---|---|---|
| **Harm** | minimize | `harms`, `friction`, `uncertainty` → `metric_total`, `metric_max` |
| **Delight** | maximize | `excitement`, `easeOfUse`, `perceivedOptimality` → `delight_total`, `delight_min` (or minimize `gap_*`) |
| **Cognitive load** | keep under persona thresholds | `cognitive.*` deficits (see `cognitive-thresholds.md`) |

### Hard constraints (every experiment after baseline)

An applied experiment is **invalid** (must revert or fix immediately) if **any**:

1. **Harm regression:** `metric_total` or `metric_max` **increases** vs last verified scores  
2. **Threshold breach:** any cognitive channel exceeds that persona’s **threshold** (`cognitive-thresholds.md`)  
3. **Safety / anti-goal violation**  
4. **Primary path broken** (exit/behavior regression on the measured scenario)

Valid uplift: delight improves (higher `delight_min` or `delight_total`, or lower `gap_*`) **and** constraints hold.

## Two regimes, one infinite outer loop

```text
regime = harm_reduce
loop forever (unless finite caps / user / safety / blocked):
  measure (primary + positive + cognitive)
  if regime == harm_reduce:
    if implementable S/M harm reductions exist:
      apply top reduction → verify (constraints)
    else:
      # harm floor for this scope (0 or irreducible residual)
      regime = delight_maximize
      survey if not yet this invocation (unless --no-survey)
      rank backlog
  if regime == delight_maximize:
    if implementable S/M uplift exists that is Pareto-admissible:
      apply top uplift → verify (no harm↑, no threshold breach, delight↑)
    else:
      stopReason = pareto-equilibrium
      break
  re-survey harm findings occasionally if delight work may have regressed surfaces
```

### Regime switch (harm → delight)

Enter **delight_maximize** when Phase-1 style **true plateau** holds:

- Harm scores flat vs previous pass **and** `implementableHarmFindingsRemaining === 0`  
- Includes **metrics-zero** (`metric_total = metric_max = 0`) **or** **irreducible residual** (only L/external harm left)

**Important:** irreducible residual **does not** end the invocation. Delight regime still runs with:

- Constraint: do not **increase** residual harm further  
- Preference: prefer uplifts that also reduce residual harm when possible  

### Pareto equilibrium (default terminal)

`stopReason: **pareto-equilibrium**` when **all** of:

1. **No admissible S/M experiment remains** that improves delight without harm↑ or threshold breach  
2. **No admissible S/M harm reduction remains**  
3. Scores (harm + delight + cognitive) **flat** vs last pass (or last N=2 passes for noise)  
4. Survey + backlog written (unless `--no-survey`)  
5. Not blocked only by agent laziness — backlog items marked `deferred`/`wontfix` with reasons when tried and failed

Optional stronger terminal:

| stopReason | Meaning |
|---|---|
| `pareto-equilibrium` | Default: no free lunch left on frontier |
| `delight-ceiling` | All positive metrics = 5 **and** cognitive under thresholds **and** harm at floor |
| `inverted-u-peak` | Further novelty/feature experiments **decrease** delight or breach thresholds for ≥2 consecutive tries (past the peak) |
| `passes-cap` / `delight-passes-cap` | Finite caps only |
| `blocked` / `user` / `safety` | Unchanged |

**Deprecated as sole terminal:** `metrics-zero` and `irreducible` as *invocation complete*. They remain **regime-switch** markers, not end of infinite run.

`scope.json`:

```json
{
  "regime": "delight_maximize",
  "stopReason": "pareto-equilibrium",
  "harmFloor": { "metric_total": 0, "metric_max": 0 },
  "delightAtStop": { "delight_min": 4, "gap_max": 1 },
  "equilibrium": {
    "kind": "pareto",
    "consecutiveNoImprove": 2,
    "rejectedUplifts": ["fr-…"],
    "reason": "No S/M uplift improves delight without harm or cognitive regression"
  }
}
```

## Admissible experiment test (checklist)

Before marking an experiment **done**:

| Check | Pass if |
|---|---|
| Harm | `metric_total` ≤ pre and `metric_max` ≤ pre |
| Delight | `delight_min` ↑ **or** `delight_total` ↑ **or** `gap_max` ↓ (at least one strict) |
| Cognitive | every channel ≤ persona threshold |
| Evidence | re-capture primary for affected scenarios |
| Persona segment | at least one target segment scores the lift (not only agent self-report) |

If delight ↑ but cognitive breaches **or** harm ↑ → **reject** (`no_improve` / `wontfix` with `rejectedBecause: constraint`).

## Relationship to `--passes` / `--delight-passes`

| Flag | Role under equilibrium policy |
|---|---|
| `--passes infinite` (default) | Outer loop continues through **both** regimes until Pareto equilibrium |
| `--passes N` | Cap **harm_reduce** cycles only (legacy name); still enter delight unless `--no-delight` |
| `--delight-passes infinite` (default in delight regime) | Cap delight cycles; default infinite until equilibrium |
| `--delight-passes N` | Finite delight cycles then stop even if not at equilibrium (`delight-passes-cap`) |
| `--no-delight` | Stop after harm floor (legacy early exit) — **opt-out** of equilibrium |
| `--harm-only` | Alias of `--no-delight` |

## Measuring the inverted-U

When an uplift **increases** feature count, density, or novelty:

1. Re-score cognitive channels (especially `choiceOverload`, `featureSprawl`, `visualClutter`, `interactiveClutter`)  
2. Re-score delight  
3. If delight ↓ **or** cognitive breach while harm flat → record **past peak** signal; do not keep piling features  

Two consecutive past-peak failures → prefer `stopReason: inverted-u-peak` if no other admissible moves.

## Harness

```bash
# Candidate equilibrium (not invocation complete)
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
  --mode equilibrium --run <runId> \
  --scores curr.json --prev-scores prev.json \
  --implementable-harm 0 --implementable-uplift 0 \
  --harm-regressed false --cognitive-breach false \
  --regime delight_maximize

# Legal completion certificate (required before claiming done)
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
  --mode assert-complete --run <runId>
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts \
  --mode mark-complete --run <runId> --stop-reason pareto-equilibrium
```

**Rules:**

- Omitted `--implementable-harm` / `--implementable-uplift` ⇒ **undeclared** ⇒ cannot equilibrium-stop (must pass explicit `0` when S/M backlog empty).
- `should-stop` plateau is **never** an invocation `stopReason` under infinite Pareto policy.
- `assert-complete` fails closed if delight never entered (unless `noDelight`), bus triples missing, no iterations, no survey/backlog (unless `--no-survey`), or summary lacks a valid terminal reason.

## Related

- [positive-metrics.md](positive-metrics.md)  
- [cognitive-thresholds.md](cognitive-thresholds.md)  
- [persona-models.md](persona-models.md)  
- [review-loop.md](review-loop.md)  
- [experiment-backlog.md](experiment-backlog.md)  
