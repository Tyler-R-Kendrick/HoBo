---
type: Agent Skill Reference
title: "OptimizeXP positive metrics"
description: "Delight metrics (excitement, ease-of-use, perceived optimality) maximized under harm non-regression and cognitive thresholds until Pareto equilibrium."
tags: [hobo, optimizexp, metrics, delight, excitement, ease-of-use, optimality, pareto, kano]
timestamp: 2026-07-31T00:00:00Z
---

# Positive metrics (delight regime)

**Harm reduce** is only the first regime of the infinite loop.  
When harm hits a **floor** (metrics-zero **or** irreducible residual with no S/M left), the loop **switches** to **delight_maximize** — it does **not** terminate (`equilibrium.md`).

Delight objectives (higher better) are optimized under:

1. **Harm non-regression** — `metric_total` and `metric_max` must not increase  
2. **Cognitive thresholds** — no channel above persona budget (`cognitive-thresholds.md`)  
3. **Inverted-U** — more features/novelty that lower delight or breach thresholds are **past peak** and rejected  

Terminal for default infinite runs: **`pareto-equilibrium`**, not “harms are low.”

## Positive metrics (higher is better)

Integers **0–5** on each persona × surface cell:

| Metric | What it captures | Standards link |
|---|---|---|
| **Excitement** | Motivation to return; emotional lift; “want to show a peer” | Kano *delighters*; peak of inverted-U arousal |
| **Ease of use** | Effortlessness of the happy path once learned | ISO 9241 efficiency/satisfaction; performance attributes |
| **Perceived optimality** | “This is how it should work” / little left to wish for | Mental-model fit; category-best expectation |

| Score | Meaning (higher better) |
|---|---|
| 0 | Actively dull / painful even if harm residual is low |
| 1 | Barely acceptable; no pull to return |
| 2 | Adequate; forgettable |
| 3 | Solid; would recommend with caveats |
| 4 | Strong; clear delight or fluency |
| 5 | Peak for this persona’s inverted-U (not “add more chrome”) |

Score through the persona’s **psychographic** lens (`persona-models.md`): low noveltySeeking → gimmicks do not raise excitement; high aestheticSensitivity → clutter kills ease/optimality.

## Aggregates

```text
delight_total = sum(excitement + easeOfUse + perceivedOptimality) over cells
delight_min   = min of any single positive metric across cells
delight_mean  = delight_total / (3 * cellCount)
gap_total     = sum( (5-excitement) + (5-easeOfUse) + (5-perceivedOptimality) )
gap_max       = max of any single (5 - score)
```

**Prefer raising `delight_min` first**, then `delight_total`.  
**`gap_*`** is the lower-is-better twin for plateau helpers.

## Formal scorecard field

Required in **delight_maximize** regime on judged outcomes; optional earlier:

```json
"positive": {
  "excitement": 3,
  "easeOfUse": 4,
  "perceivedOptimality": 3,
  "total": 10,
  "min": 3,
  "gapTotal": 5,
  "gapMax": 2
}
```

Also score **`cognitive`** on the same card (`cognitive-thresholds.md`).  
Helpers: `buildPositive`, `validatePositive`, `isParetoAdmissible`.

## Delight regime loop

```text
on enter delight_maximize:
  baseline positive + cognitive (and keep primary harm scores)
  persona survey (unless --no-survey) → feature requests → rank backlog
loop:
  pick top Pareto-admissible S/M uplift
  apply → re-capture → re-score harm + positive + cognitive
  if harm↑ or cognitive breach → revert/fix; reject experiment
  if delight↓ (past peak) → reject; record inverted-u signal
  if no admissible uplift and harm floor holds → pareto-equilibrium STOP
```

Survey may re-run after major uplifts; at least once before declaring equilibrium.

## Flags

| Form | Default | Meaning |
|---|---|---|
| (none) | on | Enter delight after harm floor |
| **`--no-delight`** / **`--harm-only`** | off | Legacy early exit after harm floor (opt out of equilibrium) |
| **`--delight-passes infinite\|N`** | **infinite** | Cap delight cycles; default infinite until equilibrium |
| **`--no-survey`** | off | Skip survey (weakens backlog; not recommended) |

## Related

- [equilibrium.md](equilibrium.md) — canonical stop  
- [cognitive-thresholds.md](cognitive-thresholds.md)  
- [persona-models.md](persona-models.md)  
- [persona-survey.md](persona-survey.md)  
- [experiment-backlog.md](experiment-backlog.md)  
