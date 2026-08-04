# HYX — HoBo Yard Experience Rubric

The qualitative acceptance instrument for the HIGHBALL! control-plane game
(ADR-0145). The machine-readable source of truth is
[`hyx-rubric.yaml`](./hyx-rubric.yaml); this file explains how to score it.

**Why it exists.** The evidence gate proves artifacts exist ("self-report is
not acceptance"); HYX proves the experience works. *Artifact-exists is not
experience.* A beautiful game that hides an outage is worse than no game —
which is why any **0** in `glanceability` or `clarity-trust` is a hard fail
regardless of the weighted mean.

## Provenance of the instrument

- **Game half** — Desurvire/Wiberg PLAY heuristics (gameplay, coolness,
  usability of mechanics), trimmed to a control-plane game.
- **Console half** — Nielsen's heuristics weighted toward visibility of
  system status, match to the real world, and error recognition; this is an
  SRE tool first.
- **Gamification glue** — Self-Determination Theory (autonomy, competence,
  relatedness) and anti-dark-pattern rails: no reward for approval speed or
  volume, no manufactured crises, no loss-aversion timers (Goodhart rails
  from the design pillars).

## Scoring

- Score every item 0–3 (see scale in the YAML). Score what you observed in
  the session, not what the code intends.
- Category score = mean of its items; overall = weighted mean by category
  weight (glanceability 3, clarity-trust 3, feedback-juice 2, core-loop 2,
  onboarding 1, consistency 1).
- **Pass**: weighted mean ≥ 2.0 AND no 0 in glanceability/clarity-trust.
  **Stretch**: ≥ 2.5.
- Record one YAML score file per session under
  `docs/validation/scores/<date>-<persona>.yaml` (copy the rubric, add
  `score:` + optional `note:` per item). `agent-history.jsonl` holds the
  advisory vision-pass medians per git sha.

## 0 vs 3 anchors (examples)

| Item | 0 looks like | 3 looks like |
|---|---|---|
| GLA-1 | Seven identical white boxes; you must open sheets to learn anything | One glance: semaphore up, Bo waving → all clear; smoking car → reauth needed |
| GLA-2 | Hazard is a 6-char chip while particles animate happily | The failed prop is the only spark-red thing on screen, with hit-stop on entry |
| TRU-1 | Synthetic trafficRate animates unlabeled next to real state | SIMULATED film-leader tag on every synthetic meter, absent on real data |
| TRU-3 | "station down" is one juicy click | Destructive ops need the deliberate stamp path; the diff is always shown |
| JUI-2 | Success and failure both just update a text label | Success: semaphore drop + go lamp + Bo jump; failure: derail + spark flash + Bo hurt |
| LOOP-1 | Operator hunts through sheets for the hazard fix | Hazard glows → lantern shows remediation hint → stamp → world visibly heals |
| ONB-1 | Player stares at an empty diagram | Dark yard, sleeping Bo, one glowing bell — everyone rings it |

## When it runs

- **Milestone gate** (not CI): after each milestone (M1 core loop, M2
  telemetry-live, M3 polish) score ≥3 sessions/persona per
  [`PLAYTEST-PROTOCOL.md`](./PLAYTEST-PROTOCOL.md).
- **Advisory automation**: `scripts/review-experience.mts` scores the
  `auto-visual: true` subset from evidence PNGs/keyframes (temperature 0,
  3 samples, median). It never blocks; `scripts/experience-drift.mts` flags
  a ≥1.0 median drop vs the trailing-5 history.
- Findings become issues labeled `experiential`, titled `[HYX:<item-id>]
  <symptom>`, with scenario id + seed + tick for exact reproduction.
