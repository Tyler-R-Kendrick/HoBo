# Plan 001: Certify real experiments and consumed feedback

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report; do not improvise. When done, update
> this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f14f1be2 -- .agents/skills/optimizexp .claude/skills/optimizexp docs/agent-tooling.md`
> and
> `git status --short -- .agents/skills/optimizexp .claude/skills/optimizexp docs/agent-tooling.md`
> If an in-scope file changed, compare the current-state evidence below with the
> live code. A semantic mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f14f1be2`, 2026-07-31

## Why this matters

OptimizeXP promises `measure -> change -> verify`, but completion currently
proves only that loosely shaped files exist. A non-report-only run can pass with
no product mutation, invalid scorecard-free bus stubs, a placeholder survey,
and an unrelated global backlog. The bus also prints persona mismatch lessons
without requiring a later expectation to consume them. This plan turns the
existing artifacts into a fail-closed experiment and feedback ledger.

## Current state

- `.agents/skills/optimizexp/workflows/cross-agent/review-loop.mts:945-978`
  counts ID triples. An entry with no `runId` counts for every run, and the
  counter does not validate scorecards or evidence.
- `.agents/skills/optimizexp/workflows/cross-agent/review-loop.mts:1095-1112`
  checks only final iteration filenames, one counted triple, and a caller-written
  `lastShouldStop`.
- `.agents/skills/optimizexp/workflows/cross-agent/review-loop.mts:1151-1168`
  accepts any JSON/Markdown in `survey/` and falls back to a global backlog that
  may belong to another run.
- `.agents/skills/optimizexp/workflows/cross-agent/review-loop.mts:1223-1246`
  validates `feature-coverage.json` only when it happens to exist despite the
  documented mandatory coverage gate.
- `.agents/skills/optimizexp/workflows/cross-agent/review-loop.mts:1248-1287`
  finds outcomes by filename containing the run ID, not by `body.runId`, and
  silently accepts outcomes with no evidence link.
- `.agents/skills/optimizexp/harness/survey.mts:268-303` emits score `3`, agent
  placeholder prose, and a placeholder S-effort feature request as if they were
  data. `validateSurvey` at lines 169-234 does not reject those sentinels.
- `.agents/skills/optimizexp/harness/test/review-loop-stop-gate.test.mts:254-374`
  calls `{}` a survey, uses scorecard-free bus entries, and expects the legal
  closeout to pass. Replace this positive bypass with negative regressions.
- Existing conventions to reuse: `validateScorecard`, `validateComparison`,
  `validateSurvey`, evidence `meta.repro.via === "capture-evidence"`, and the
  current expect/act/outcome IDs. Do not create a second bus.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Stop-gate tests | `node --import tsx --test .agents/skills/optimizexp/harness/test/review-loop-stop-gate.test.mts` | exit 0; all cases pass |
| Survey tests | `node --import tsx --test .agents/skills/optimizexp/harness/test/survey.test.mts` | exit 0; all cases pass |
| Mirrors | `pnpm run skills:mirror-check` | exit 0 |
| Staged gate | `pnpm agent:check -- --staged` | exit 0 |

## Scope

**In scope**:

- `.agents/skills/optimizexp/workflows/cross-agent/review-loop.mts`
- `.agents/skills/optimizexp/harness/survey.mts`
- `.agents/skills/optimizexp/harness/test/review-loop-stop-gate.test.mts`
- `.agents/skills/optimizexp/harness/test/survey.test.mts` (create)
- Matching byte-identical files under `.claude/skills/optimizexp/`
- `.agents/skills/optimizexp/references/{agent-bus,review-loop,persona-survey,experiment-backlog}.md`
- Matching reference files under `.claude/skills/optimizexp/`
- `docs/agent-tooling.md`
- `plans/README.md` (status row only)

**Out of scope**:

- Pareto math and frontier policy; plan 002 owns it.
- Persona or Gherkin generation; plans 003-004 own them.
- `packages/code/**`, `.optimizexp/**`, package runtime code, and current user
  artifacts.
- New dependencies or a database-backed bus.

## Git workflow

- Branch: `advisor/001-optimizexp-experiment-certificate`
- Commit by logical step using the repo's conventional style, for example
  `fix(optimizexp): require verified experiment closeout`.
- Do not push or open a PR unless instructed.
- Before each incremental commit, stage only that step's in-scope files plus the
  status row when it changes, then run `pnpm agent:check -- --staged`.
- Before declaring the branch complete, run `git fetch origin`, rebase on
  `origin/main`, then run `pnpm agent:check -- --base=origin/main`.

## Steps

### Step 1: Make the existing bypasses fail

Repair the current test runner so it reports individual failures reliably.
Replace the fake “full legal closeout” fixture with a fully valid run fixture.
Add negative cases proving `assert-complete` rejects: missing or foreign
`runId`, invalid scorecards/comparisons, an unclosed expect, no post-change
evidence, required-but-missing `feature-coverage.json`, an unfilled survey
template, a foreign/global-only backlog, and a non-report-only run with no
verified experiment.

**Verify**: run the stop-gate test before implementation. The new negative
cases must fail for the expected missing semantic checks, not from fixture or
JSON parsing errors.

### Step 2: Record a minimal machine-readable experiment certificate

Keep `reduction.md` as the human view and write one machine contract per actual
experiment at `iterations/<nnn>/experiments/<experiment-id>.json`. It must
include: run/iteration, stable experiment ID, regime, finding or backlog item
ID, report-only flag, mutation kind, affected paths or safe local action,
before/after evidence IDs, before and after outcome IDs, result
(`improved|no-improve|regressed|rejected`), and a verified timestamp. Every
claimed change in `reduction.md` must reference exactly one certificate; every
certificate must be referenced once.

The canonical runner must capture the before state before mutation. For tracked
files, record the base commit and Git blob IDs and recompute them from the
repository. For untracked files or local state, a `begin-experiment` operation
must create the immutable before snapshot and SHA-256 digest; `finish-experiment`
captures the after state. `assert-complete` recomputes snapshot hashes and the
current/Git-backed post-state instead of trusting digests copied into JSON. For
a safe setup action, capture the exact command plus hashed before/after
observable state through the same two-phase runner. Require at least one
verified changed digest or observable. Do not accept narrative alone.

Non-report-only completion requires at least one verified experiment and no
iteration that claims a reduction without its certificate. Report-only runs
must explicitly carry `reportOnly: true` and must not fabricate a mutation.

**Verify**: stop-gate tests accept a valid file-mutation and safe-action
certificate and reject a no-op digest pair and missing post-change outcome.

### Step 3: Make bus validation run-scoped and feedback-closing

Refactor the existing validator just enough for both `validate-bus` and
`assert-complete` to call the same checks. Require exact `body.runId === runId`
for run completion. Validate every selected entry's scorecard, links, outcome
comparison, evidence link, and capture stamp.

Walk entries chronologically per persona plus feature/surface. After a mismatch,
the next expectation on that cell must either reference the outcome via
`correctedFrom`, carry non-empty `lessons`, and move predicted primary scores
toward the last judgment, or cite a verified intervening experiment. An open
mismatch cannot be ignored at completion.

**Verify**: tests reject an uncorrected repeat and accept both a corrected
expectation and a verified-experiment reset.

### Step 4: Validate real survey and backlog content

Write survey templates with null/incomplete values, not plausible scores.
Reject placeholder sentinels, missing first-person rationale, missing evidence
references when evidence informed the response, and feature requests not linked
to answer IDs. Make aggregate/rank call `validateSurvey` and fail on zero valid
active-persona responses.

At closeout require one valid response for every scoped persona, this run's
validated `survey/aggregate.json`, and this run's `backlog.json` with matching
`runId`. Never substitute `.optimizexp/backlog/experiments.json`.

**Verify**: survey tests reject an untouched template; stop-gate tests reject a
missing persona response and accept a complete scoped set.

### Step 5: Require feature coverage and synchronize documentation

Define `coverageRequired` exactly as
`!scope.reportOnly || scope.features.length > 0 || any experiment/evidence references a featureId or catalog experienceId`.
When true, require a valid `feature-coverage.json` with no P0, rubber-duck, or
template-quality gaps. An empty feature scope is legal only when
`reportOnly: true`, no experiment/evidence references a feature or catalog row,
and the surface is explicitly classified as docs/inventory-only.

Update the references and `docs/agent-tooling.md` to describe the exact
certificate and feedback rules. Mirror `.agents` to `.claude` byte-for-byte.

**Verify**: all commands in the command table exit 0.

## Test plan

- Model new survey tests after the temporary-directory style in
  `harness/test/review-loop-stop-gate.test.mts`.
- Cover valid and invalid scorecards, run isolation, evidence stamps, no-op
  mutations, report-only, mismatch correction, placeholder survey rejection,
  active-persona completeness, foreign backlog, and mandatory coverage.
- Keep tests offline and use only temporary directories.

## Done criteria

- [ ] A non-report-only run without a verified mutation cannot complete.
- [ ] `assert-complete` invokes the same semantic bus validation as `validate-bus`.
- [ ] Bus entries missing or mismatching `runId` never count for another run.
- [ ] Untouched survey templates and global-only backlogs cannot satisfy closeout.
- [ ] An ignored persona mismatch blocks advancement/completion.
- [ ] Required feature coverage is fail-closed.
- [ ] Focused tests, mirror check, staged checks before each commit, and final
      base-scoped agent gate exit 0.
- [ ] No files outside Scope are modified.

## STOP conditions

- Existing run artifacts need to remain completable without migration and the
  required compatibility behavior is not specified.
- A valid mutation cannot be evidenced without storing secrets or unstable
  absolute paths.
- The change requires editing current `.optimizexp/**` or `packages/code/**`
  user work.

## Maintenance notes

Reviewers should try to forge every new field manually. The certificate is
valuable only if completion derives and cross-checks it against bus/evidence
artifacts rather than trusting booleans written by the caller.
