---
type: Agent Skill Reference
title: "OptimizeXP persona survey"
description: "End-of-run pseudo survey: poll personas for feedback that becomes feature requests and experiment backlog fuel."
tags: [hobo, optimizexp, survey, persona, feedback, feature-request]
timestamp: 2026-07-31T00:00:00Z
---

# Persona survey (end of run)

When a run finishes Phase 1 (metrics-zero **or** irreducible) — and again after Phase 2 if delight ran — poll each **active persona** in a **pseudo survey**. Personas answer **in character** from evidence + bus feelings, not as the coding agent.

Default: **on**. Opt out: **`--no-survey`** / `OPTIMIZEXP_NO_SURVEY=1`.

## Purpose

1. Capture **qualitative feedback** that numeric harm scores miss.  
2. Score **positive metrics** (excitement, easeOfUse, perceivedOptimality) per persona × surface.  
3. Turn free-text answers into **pseudo feature requests**.  
4. Feed **experiment backlog** ranking (`experiment-backlog.md`).

## When to run

| Phase 1 stop | Survey? | Delight phase? |
|---|---|---|
| `metrics-zero` | **Yes** (required unless `--no-survey`) | Yes (unless `--no-delight`) |
| `irreducible` (residual harm > 0) | **Yes** | No (positives advisory only) |
| `passes-cap` / blocked / user / safety | **Yes** if any cells were measured | No (or only if primary already 0) |
| `--report-only` | Yes (measure-only; no uplift apply) | Score only |

Survey is **write-once per persona per run** (overwrite allowed only if re-running the whole end sequence).

## Locations

```text
.optimizexp/runs/<run-id>/survey/
  <persona-id>.json           # one response file per persona
  aggregate.json              # rollup + extracted featureRequests
.optimizexp/bus/entries/
  <iso>-<seq>-survey.json     # optional bus mirror (kind: survey)
```

## Pseudo survey form (fixed questions)

Agents **must** use this instrument (can add optional free-text only under `extraQuestions`):

| Id | Prompt | Maps to |
|---|---|---|
| `q_excitement` | On a scale of 0–5, how **excited** are you to use this path again? Why? | excitement + rationale |
| `q_ease` | On a scale of 0–5, how **easy** was the happy path? What still felt heavier than it should? | easeOfUse |
| `q_optimal` | On a scale of 0–5, how **optimal** does this feel vs how it *should* work? What is missing? | perceivedOptimality |
| `q_delight` | What, if anything, **delighted** you? | featureRequests (keep/amplify) |
| `q_friction_feel` | Even if nothing “broke,” what felt **annoying or dull**? | featureRequests (fix/uplift) |
| `q_one_change` | If you could demand **one change** next week, what is it? | top featureRequest |
| `q_never` | What should we **never** do on this path? | harms guardrails / anti-goals |
| `q_recommend` | Would you recommend this experience to a peer? (yes/mixed/no + why) | desirability alignment |

Answers are **first person as the persona**. Cite evidence paths when visual/CLI transcript informed the score.

## Response schema (`survey/<persona>.json`)

```json
{
  "schemaVersion": 1,
  "kind": "persona-survey",
  "runId": "20260731-all-exp",
  "persona": "product-app-developer",
  "experiences": ["dx"],
  "surfaces": ["pnpm run doctor"],
  "featureIds": ["cli-help-and-doctor"],
  "polledAt": "2026-07-31T16:00:00.000Z",
  "primaryPhaseStop": "metrics-zero",
  "answers": [
    {
      "id": "q_excitement",
      "prompt": "On a scale of 0–5, how excited…",
      "score": 3,
      "text": "Doctor is fine but not something I look forward to."
    },
    {
      "id": "q_ease",
      "prompt": "…",
      "score": 4,
      "text": "One command, clear ok lines."
    },
    {
      "id": "q_optimal",
      "prompt": "…",
      "score": 3,
      "text": "Want a single 'fix forward' for the gbrain warn."
    },
    {
      "id": "q_delight",
      "prompt": "…",
      "text": "WorkOS AUTH wording was honest."
    },
    {
      "id": "q_friction_feel",
      "prompt": "…",
      "text": "Warn without a one-line skip path still nags."
    },
    {
      "id": "q_one_change",
      "prompt": "…",
      "text": "Print the exact zero-key next command under the gbrain warn."
    },
    {
      "id": "q_never",
      "prompt": "…",
      "text": "Never auto-install gbrain or send embeddings without consent."
    },
    {
      "id": "q_recommend",
      "prompt": "…",
      "recommend": "mixed",
      "text": "Solid offline doctor; not delightful yet."
    }
  ],
  "positive": {
    "excitement": 3,
    "easeOfUse": 4,
    "perceivedOptimality": 3,
    "total": 10,
    "min": 3,
    "gapTotal": 5,
    "gapMax": 2
  },
  "featureRequests": [
    {
      "id": "fr-doctor-gbrain-next-step",
      "title": "Doctor gbrain warn prints zero-key next command",
      "problem": "Warn leaves agent unsure of exact remediation line.",
      "desiredOutcome": "Transcript includes copy-pasteable setup --no-gbrain or decline MCP line.",
      "source": "survey",
      "sourceAnswerIds": ["q_one_change", "q_optimal"],
      "persona": "product-app-developer",
      "featureIds": ["cli-help-and-doctor"],
      "surfaces": ["pnpm run doctor"],
      "impactOn": { "excitement": 1, "easeOfUse": 1, "perceivedOptimality": 2 },
      "effortHint": "S",
      "priorityScore": 0,
      "antiGoals": ["never auto-install gbrain"]
    }
  ],
  "evidenceRefs": [
    ".optimizexp/features/cli-help-and-doctor/evidence/…/"
  ]
}
```

### Rules

1. **`positive` scores** must match `q_excitement` / `q_ease` / `q_optimal` integer answers.  
2. **At least one** `featureRequest` when any positive score ≤ 3 **or** `q_one_change` is non-empty.  
3. Feature requests are **pseudo product requests** — not Linear issues yet. Downstream: backlog ranking, then optional `sdlc` / improve.  
4. **Never invent** secrets, credentials, or live third-party calls as the requested change.  
5. Bus feelings/desirability from the run **inform** answers; they do not replace the survey instrument.

## Aggregate

```bash
node --import tsx .agents/skills/optimizexp/harness/survey.mts \
  --mode aggregate --run <runId>
```

Writes `survey/aggregate.json`:

- mean/min positive metrics across personas  
- flat list of `featureRequests`  
- recommended backlog order (pre-rank)

## Bus kind `survey` (optional)

```json
{
  "kind": "survey",
  "id": "2026-07-31T16:00:00Z-9901-survey",
  "runId": "…",
  "persona": "product-app-developer",
  "path": ".optimizexp/runs/…/survey/product-app-developer.json",
  "positive": { "…": "…" },
  "featureRequestCount": 1
}
```

`validate-bus` accepts `kind: survey` without full expect/act scorecards.

## Agent procedure (end of invocation)

1. List personas in `scope.json` / measured cells.  
2. For each persona, write `survey/<persona>.json` from evidence + bus.  
3. `survey.mts --mode aggregate --run <id>`.  
4. `survey.mts --mode rank-backlog --run <id>` (updates `runs/<id>/backlog.json` + merges `.optimizexp/backlog/experiments.json`).  
5. If Phase 2 active and not report-only: apply top S/M uplift from backlog.  
6. Summarize survey themes + top 5 backlog items in `summary.md`.

## Related

- [positive-metrics.md](positive-metrics.md)  
- [experiment-backlog.md](experiment-backlog.md)  
- [agent-bus.md](agent-bus.md) — feelings/desirability feed survey  
