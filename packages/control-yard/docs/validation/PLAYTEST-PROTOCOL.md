# HIGHBALL! Playtest Protocol

Moderated qualitative sessions that produce [HYX](./HYX-RUBRIC.md) scores.
This gates milestones (M1 core loop, M2 telemetry-live, M3 polish), never CI.

## Cadence & sample

- One round per milestone; minimum **3 sessions per persona per round**.
- Personas: **operator-at-3am** (SRE on call), **app developer**,
  **release owner**.
- Every evaluator sees identical stimulus: sessions run against the seeded
  deterministic scenarios (`?test=1&seed=<seed>&scenario=<id>`), so a finding
  is reproducible by scenario + seed + tick.

## Session structure (30–40 min)

1. **Cold open (5 min, silent moderator)** — `first-run` scenario, no
   instruction. Think-aloud. Note the time to first successful interaction
   (ONB-1) and anything the player expected to be clickable.
2. **Incident drill (10 min)** — `incident-storm`, seed 1337. Measure:
   - **time-to-detect**: first verbalization that something is wrong;
   - **time-to-correct-action**: correct remediation sheet confirmed.
   Both go in the session score file as `metrics:`.
3. **Persona task (10 min)**:
   - operator-at-3am: clear the board from `quota-exhaustion` + a revoked
     connection; reach Highball.
   - app developer: create + authorize a connection; find its real id/scopes
     via inspect.
   - release owner: run `deploy-saga` — publish → approve → activate a rail
     through the stamp path; explain what evidence they saw at each step.
4. **Debrief (5–10 min)** — [questionnaire](./playtest-questionnaire.md),
   then three open questions keyed to rubric categories.

## Recording

Use the session recording mode of the demo harness (records the human-driven
headed browser via Playwright `recordVideo`, same MP4 pipeline as evidence):
outputs to `public/shots/playtests/<date>-<persona>-<scenario>.mp4`
(gitignored; only aggregated score files are committed).

## From findings to fixes

- Every observed breakdown → GitHub issue labeled `experiential`, titled
  `[HYX:<item-id>] <symptom>`, body links the MP4 timestamp + scenario id +
  seed + tick.
- Moderator fills one score file per session:
  `docs/validation/scores/<date>-<persona>.yaml` (per-item `score:` 0–3 +
  `note:`, plus `metrics: {timeToDetectSec, timeToCorrectActionSec}`).
- Milestone passes when the aggregate (mean across sessions) meets the HYX
  thresholds: weighted mean ≥ 2.0, no 0s in glanceability/clarity-trust.

## Moderator rules

- Never explain a mechanic before the cold open ends; the empty station is
  the tutorial (design pillar: reality is the level designer).
- Never defend the design during think-aloud; record verbatim confusion.
- If the player asks "is this real data?", record which surface made them
  ask — that is a TRU-1 finding regardless of the answer.
