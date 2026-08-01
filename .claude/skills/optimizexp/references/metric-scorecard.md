---
type: Agent Skill Reference
title: "OptimizeXP metric scorecard"
description: "Formal scorecard output on every expect, act, and outcome bus entry for harms, friction, uncertainty, and HCD deficits."
tags: [hobo, optimizexp, scorecard, metrics, bus]
timestamp: 2026-07-30T00:00:00Z
---

# Metric scorecard (formal output)

Every bus phase — **expect**, **act**, **outcome** — MUST emit a formal **`scores`** object that scores against the primary **harm** metrics (and optional HCD deficits). In **Phase 2** / survey, also emit optional **`scores.positive`** (excitement / easeOfUse / perceivedOptimality — higher better). Feelings and desirability are complementary; they do **not** replace numeric scores.

Scale and metric definitions: `references/metrics.md` (harm: lower better) and `references/positive-metrics.md` (delight: higher better).

## Scorecard schema

```json
{
  "schemaVersion": 1,
  "phase": "expect | act | outcome",
  "role": "predicted | observed | judged",
  "persona": "developer",
  "surface": "pnpm agent:check -- --staged",
  "primary": {
    "harms": 0,
    "friction": 2,
    "uncertainty": 1,
    "total": 3,
    "max": 2
  },
  "positive": {
    "excitement": 3,
    "easeOfUse": 4,
    "perceivedOptimality": 3,
    "total": 10,
    "min": 3,
    "gapTotal": 5,
    "gapMax": 2
  },
  "hcd": {
    "visibilityOfSystemStatus": 1,
    "matchWithMentalModel": 0,
    "userControlAndFreedom": 0,
    "consistencyAndStandards": 1,
    "errorPrevention": 0,
    "recognitionOverRecall": 1,
    "flexibilityAndEfficiency": 2,
    "aestheticAndMinimalistDesign": 0,
    "errorRecovery": 1,
    "helpAndDocumentation": 1,
    "accessibilityAndInclusion": 0,
    "trustAndSafety": 0
  },
  "hcdTotal": 7,
  "hcdMax": 2,
  "rationale": {
    "harms": "No offensive content or secret leakage observed/predicted.",
    "friction": "May select broader gates than staged scope.",
    "uncertainty": "Output may omit next-step recovery text."
  },
  "evidenceRefs": [],
  "scoredAt": "2026-07-30T21:00:00.000Z"
}
```

### Field rules

| Field | Required | Notes |
|---|---|---|
| `schemaVersion` | yes | Currently `1` |
| `phase` | yes | Must match bus entry `kind` |
| `role` | yes | `predicted` (expect) · `observed` (act) · `judged` (outcome) |
| `persona` | yes | Persona id judging this scorecard |
| `surface` | yes | Stable surface name |
| `primary.harms/friction/uncertainty` | yes | Integers 0–5 (lower better) |
| `primary.total` | yes | Must equal sum of the three |
| `primary.max` | yes | Must equal max of the three |
| `positive.excitement/easeOfUse/perceivedOptimality` | delight regime / survey | Integers 0–5 (**higher** better) |
| `positive.total/min/gapTotal/gapMax` | if `positive` | See `positive-metrics.md` / `buildPositive` |
| `cognitive.*` | delight regime / load-sensitive reviews | 0–5 load channels + `breaches[]` — `cognitive-thresholds.md` |
| `hcd.*` | recommended | Each 0–5 deficit; omit only if phase is pure CLI probe and documented |
| `hcdTotal` / `hcdMax` | if `hcd` present | Sum and max of HCD fields |
| `rationale` | yes | At least one of the three primary keys explained in one sentence each when score ≥ 1; score 0 may use a short all-clear |
| `evidenceRefs` | act/outcome | Paths to evidence/transcript; expect may be empty. **Every cited path must exist** (repo-root-relative or absolute) — missing refs are validation errors. |
| `evidenceChecks` | optional | Falsifiability rubric. Each entry: `evidence` (evidence dir with capture-evidence `meta.json`) plus at least one assertion — `exitCodeEquals` / `exitCodeNotEquals` (integer, checked against `meta.json.exitCode`) and/or `transcriptContains` / `transcriptNotContains` (regex against the primary transcript). Every check is programmatically evaluated; a failing check is a validation error. |
| `justification` | when scores repeat a prior measurement | Free-text reason a carry-over is legitimate. Required when an iteration `scores.json` is byte-identical or score-identical to `baseline.json` (copied-scores lint in assert-complete). |
| `scoredAt` | yes | ISO-8601 UTC |

### Phase semantics

| Phase | `role` | What the scores mean |
|---|---|---|
| **expect** | `predicted` | Scores the persona **predicts** for the result **if** the expectation holds — the forecast before acting. Also used as the comparison baseline for outcome deltas. |
| **act** | `observed` | Scores from **what is seen during/after capture** (transcript, UI, video) **before** full persona judgment write-up. Mechanical + first-pass persona read of evidence. |
| **outcome** | `judged` | Final persona judgment scores after feelings/desirability. Source of truth for iteration `scores.json` cells. |

## Outcome comparison block (required on outcome)

```json
{
  "comparison": {
    "expectId": "2026-07-30T21:00:00Z-0001",
    "actId": "2026-07-30T21:01:00Z-0002",
    "deltaFromExpect": {
      "harms": 0,
      "friction": 1,
      "uncertainty": 1,
      "total": 2,
      "max": 0
    },
    "deltaFromAct": {
      "harms": 0,
      "friction": 0,
      "uncertainty": 1,
      "total": 1,
      "max": 0
    },
    "matchedExpectation": false,
    "expectationMatch": {
      "behavior": false,
      "scoresWithinTol": false,
      "tolerance": 0
    }
  }
}
```

- `delta*` = `judged - predicted` (or `judged - observed`); **positive means worse**.
- `matchedExpectation.behavior` = Gherkin/result match.
- `scoresWithinTol` = each primary metric differs from expect by at most `tolerance` (default `0`).
- `matchedExpectation` overall = behavior match **and** scores within tolerance (unless `tolerance` explicitly relaxed in the expect entry).

## Act entry (required between expect and outcome)

```text
.optimizexp/bus/entries/<iso8601>-<seq>-act.json
```

Act is not optional for full review cycles. If capture is purely mechanical, still emit `scores` with `role: "observed"` from the evidence (transcript length, exit code ambiguity, UI blank states, etc.).

## Aggregation into run scores

When writing `runs/<id>/iterations/<nnn>/scores.json`:

1. Take each closed **outcome** scorecard for the iteration.
2. Map to a cell: `{ persona, surface, harms, friction, uncertainty }` from `scores.primary`.
3. Recompute `metric_total` / `metric_max`.
4. Prefer outcome `judged` over act `observed`; never use expect `predicted` as current state.

## Validation

Harness / review-loop `validate-bus` checks:

1. Every `expect` / `act` / `outcome` has `scores` with valid primary 0–5 and consistent `total`/`max`.
2. Every `outcome` references `expects` and includes `comparison.deltaFromExpect`.
3. Prefer every `outcome` also references `actId` when an act exists for that expect.
4. Invalid scorecards fail validation (hard error).

CLI:

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --mode validate-bus
node --import tsx .agents/skills/optimizexp/harness/scorecard.mts --mode validate --entry path.json
node --import tsx .agents/skills/optimizexp/harness/scorecard.mts --mode compare --expect e.json --act a.json --outcome o.json
```
