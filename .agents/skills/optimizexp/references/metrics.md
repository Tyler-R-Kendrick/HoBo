---
type: Agent Skill Reference
title: "OptimizeXP metrics"
description: "Score harms, friction, and uncertainty for human-centered experience review."
tags: [hobo, optimizexp, metrics, hcd, harms, friction, uncertainty]
timestamp: 2026-07-30T00:00:00Z
---

# Metrics

Primary goal: **reduce** three scores each iteration. Lower is better.

**Plateau ≠ “scores flat.”** Stop only when scores did not improve **and** no implementable S/M reductions remain (see `review-loop.md` § Anti-stall). If you can still name a concrete fix, keep going.

## Primary metrics

| Metric | What it captures | Examples |
|---|---|---|
| **Harms** | Offensive, exclusionary, or unsafe language, symbolism, imagery, or defaults; privacy/security exposure in the experience path | ableist copy; scary error dumps with secrets; hostile empty states; dark patterns that coerce |
| **Friction** | Repetition, artificial hurdles, wasted steps, slow feedback, ceremony without value | re-running full monorepo tests to discover one file; re-auth loops; copy-paste config across agents |
| **Uncertainty** | Unintuitive or contrary information, silent failure, ambiguous results, missing next steps | CLI exit 0 with broken state; docs that contradict AGENTS.md; agent tools that fail without recovery |

## Scoring scale (per persona × surface)

Use integers **0–5**:

| Score | Meaning |
|---|---|
| 0 | None observed |
| 1 | Rare / cosmetic |
| 2 | Noticeable but workaround-easy |
| 3 | Frequent or blocks a common path |
| 4 | Blocks primary path or risks real harm |
| 5 | Severe, systemic, or actively harmful |

Record cells (run iteration rollup):

```json
{
  "persona": "developer",
  "surface": "agent:check",
  "harms": 0,
  "friction": 3,
  "uncertainty": 2,
  "evidence": [".optimizexp/bus/entries/....-outcome.json"],
  "notes": "full check selected when staged would suffice"
}
```

**Authoritative phase scores** live on every bus entry as a formal **scorecard** (`scores` object). See `references/metric-scorecard.md` and `references/agent-bus.md`.

| Phase | Score role | When written |
|---|---|---|
| expect | `predicted` | Before act |
| act | `observed` | After capture / evidence |
| outcome | `judged` | After persona judgment (+ `comparison` deltas) |

Iteration `scores.json` cells MUST be derived from **outcome** `scores.primary` (not expect predictions).

## Aggregate

For a run iteration:

- `metric_total = sum(harms + friction + uncertainty)` over all persona × surface cells
- `metric_max = max of any single cell metric`
- Prefer reducing **metric_max** first (worst single pain), then **metric_total**

Numeric flatness: an iteration where `metric_total` does not decrease **and** `metric_max` does not decrease.

**True plateau** (stop): numeric flatness **plus** zero implementable findings remaining. Flat scores with an open backlog of concrete fixes = **continue**.

## Human-centered design (HCD) rubric

Score each active persona on these principles (0–5 **deficit** scores — lower better, same scale):

| Principle | Ask |
|---|---|
| **Visibility of system status** | Does the persona always know what is happening? |
| **Match with mental model** | Language and structure match the persona's world? |
| **User control & freedom** | Easy undo, escape, partial progress? |
| **Consistency & standards** | Same concept, same words, same commands? |
| **Error prevention** | Are footguns removed before messaging? |
| **Recognition over recall** | Can they act without memorizing? |
| **Flexibility & efficiency** | Shortcuts for experts; guided path for novices? |
| **Aesthetic & minimalist design** | No irrelevant noise in the critical path? |
| **Help users recognize, diagnose, recover from errors** | Actionable, non-blaming failures? |
| **Help & documentation** | Help is searchable, task-shaped, adjacent? |
| **Accessibility & inclusion** | Works across ability, language, tooling constraints? |
| **Trust & safety** | No coercion; secrets protected; consent clear? |

HCD deficits feed the three primary metrics (map principles → harms / friction / uncertainty in notes). Do not invent a fourth primary metric; HCD is the diagnostic lens.

## Evidence rules

- No score without a bus entry **and**, for visual/TUI/web/native (and preferably CLI), a feature evidence path under `.optimizexp/features/<feature>/evidence/<scenario>/`.
- Cite `primary.*` / `manifest.json`, bus entry id, or file:line.
- Feelings from the outcome bus entry are qualitative signal; they do not replace numeric scores. For visual surfaces, feelings must reference what appears in the evidence recording.
- Desirability (`desired` | `mixed` | `undesired`) on outcomes should align with metric direction — `undesired` implies at least one metric ≥ 2 unless justified.
