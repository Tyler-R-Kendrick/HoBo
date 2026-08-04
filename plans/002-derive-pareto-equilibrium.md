# Plan 002: Derive Pareto stopping from canonical run artifacts

> **Executor instructions**: Follow this plan step by step and run every
> verification. Stop on any STOP condition. Update `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat f14f1be2 -- .agents/skills/optimizexp .claude/skills/optimizexp docs/agent-tooling.md`
> and
> `git status --short -- .agents/skills/optimizexp .claude/skills/optimizexp docs/agent-tooling.md`.
> Reconcile changes from plans 001 and 003 before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-certify-real-optimizexp-experiments.md`,
  `plans/003-ground-persona-generation.md`
- **Category**: bug
- **Planned at**: commit `f14f1be2`, 2026-07-31

## Why this matters

The current equilibrium command trusts caller-supplied zero counts and boolean
non-regression flags. Missing delight fields become zero, cognitive thresholds
are not derived from personas, and one non-admissible comparison can help prove
equilibrium. This is not even a reliable scoped local Pareto stop. The runner
must derive its objective vector, candidate exhaustion, and consecutive
no-improvement evidence from canonical run artifacts.

## Current state

- `references/equilibrium.md:83-89` requires no S/M harm or uplift candidate,
  flat harm/delight/cognitive scores, survey/backlog, and justified terminal
  candidate states.
- `review-loop.mts:785-797` parses implementable counts and regression/breach
  booleans from CLI arguments.
- `review-loop.mts:808-831` coalesces absent delight metrics to zero and allows
  `pareto?.ok === false` to satisfy the terminal predicate.
- `review-loop.mts:850-858` checks total-harm regression but omits a direct
  `metric_max` regression guard in the delight branch.
- `harness/lib/scorecard.mts:282-308` implements one experiment's admissibility,
  not proof that no candidate remains.
- `review-loop.mts:1430-1449` aggregates only primary harm fields from outcomes;
  positive and cognitive results are caller-authored elsewhere.
- The existing closeout test at `harness/test/review-loop-stop-gate.test.mts:331-370`
  reaches equilibrium without primary, positive, or cognitive scorecards.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Stop/equilibrium tests | `node --import tsx --test .agents/skills/optimizexp/harness/test/review-loop-stop-gate.test.mts` | exit 0 |
| Scorecard tests | `node --import tsx --test .agents/skills/optimizexp/harness/test/scorecard.test.mts` | exit 0 |
| Mirrors | `pnpm run skills:mirror-check` | exit 0 |
| Staged gate | `pnpm agent:check -- --staged` | exit 0 |

## Scope

**In scope**:

- `.agents/skills/optimizexp/workflows/cross-agent/review-loop.mts`
- `.agents/skills/optimizexp/harness/lib/scorecard.mts`
- `.agents/skills/optimizexp/harness/test/{review-loop-stop-gate,scorecard}.test.mts`
- `.agents/skills/optimizexp/references/{equilibrium,review-loop,metric-scorecard,cognitive-thresholds,experiment-backlog}.md`
- Matching `.claude/skills/optimizexp/**` files
- `docs/agent-tooling.md`
- `plans/README.md` (status row only)

**Out of scope**: a general optimizer, statistical experimentation service,
new dependencies, existing product artifacts, and claims of a global optimum
outside the enumerated run scope.

## Git workflow

- Branch: `advisor/002-optimizexp-derived-equilibrium`
- Commit example: `fix(optimizexp): derive equilibrium from run artifacts`.
- Do not push or open a PR unless instructed.
- Before each incremental commit, stage only that step's in-scope files plus the
  status row when it changes, then run `pnpm agent:check -- --staged`.
- Before declaring the branch complete, run `git fetch origin`, rebase on
  `origin/main`, then run `pnpm agent:check -- --base=origin/main`.

## Steps

### Step 1: Define one canonical iteration objective vector

Extend bus aggregation to emit, per scoped persona/surface cell: primary harm,
positive metrics, complete cognitive channels, persona threshold breaches, and
evidence/outcome IDs. Reject missing positive/cognitive data in delight regime.
Load thresholds from the resolved schema-v2 persona file; do not trust a
caller-provided breach boolean. Require coverage of every scoped cell or an
explicit terminal exclusion with reason.

**Verify**: scorecard tests cover a threshold breach, increased harm max,
improved delight, missing delight data, and missing scoped cells.

### Step 2: Derive candidate counts from the run ledger

Use plan 001's experiment certificates plus this run's findings/backlog as the
source of truth. If harm findings remain Markdown-only, add the smallest
machine-readable sibling `findings.json` and keep `findings.md` as its view.
Each candidate record must contain `id`, `runId`, persona/surface or feature
cell, `kind: harm|uplift`, `effort: S|M|L`, `status`, evidence IDs, and reason or
linked experiment where required. Legal statuses are: `ready`; `applied`
(linked certificate); `rejected` (linked rejected certificate); `duplicate`
(canonical candidate ID); `out-of-scope` (fixed before the candidate-set digest
is established); and `blocked` (external reason). A blocked S/M candidate yields
a blocked terminal, not Pareto. Deferring an in-scope S/M candidate leaves it
ready. Derive ready S/M counts from this ledger and reject malformed lifecycle
transitions.

Keep `--implementable-harm` and `--implementable-uplift` only as compatibility
assertions: when supplied, reject a mismatch with derived counts. They must not
set state.

**Verify**: tests prove forged zeros cannot stop while a ready S/M item exists.

### Step 3: Implement scoped local Pareto equilibrium honestly

Require all of the following for `pareto-equilibrium`: harm total and max do not
regress; no persona threshold is breached; no ready S/M harm or uplift candidate
remains; complete objective vectors are flat for two consecutive verified
iterations after the last accepted experiment; and a validated survey/backlog
refresh occurred after that experiment. A rejected experiment is evidence only
for that candidate, never proof that the frontier is exhausted.

Record `equilibrium.kind: "scoped-local-pareto"`, candidate-set digest,
consecutive no-improvement count, rejected candidate IDs/reasons, and objective
vectors. Update prose that currently overstates a mathematical global optimum.

**Verify**: tests reject one flat pair, one rejected candidate, stale survey,
harm-max regression, missing cognitive fields, and changed candidate-set digest;
they accept two complete flat iterations with an exhausted justified set.

### Step 4: Derive inverted-U and cap terminals

Require two consecutive verified rejected experiments whose linked before/after
canonical objective vectors independently show increased novelty or information
density and decreased delight or a persona-threshold breach before
`inverted-u-peak`; do not trust a certificate label for this classification.
Derive finite pass caps from scope counters and configured limits. Keep
user/safety/blocked terminals explicit and separate from Pareto.

**Verify**: negative and positive terminal tests pass with exact stop reasons.

### Step 5: Synchronize documentation and mirrors

Update equilibrium/review/scorecard docs with the canonical vector, local scope,
candidate statuses, consecutive rule, and CLI-assertion behavior. Mirror files
byte-identically and update agent-tooling maintenance notes.

**Verify**: all command-table commands exit 0.

## Test plan

Use temporary runs and complete scorecards. Test missing fields, persona
threshold derivation, harm total/max, candidate lifecycle, stale survey,
consecutive flatness, rejected experiments, inverted-U, and finite caps.

## Done criteria

- [ ] Equilibrium ignores no caller-authored count or regression boolean.
- [ ] Delight-regime vectors require positive and cognitive data for all cells.
- [ ] One failed experiment or one flat pair cannot stop the run.
- [ ] The candidate set is exhausted with reasons and has a recorded digest.
- [ ] The terminal is named and documented as scoped local Pareto equilibrium.
- [ ] Focused tests, mirrors, staged checks before each commit, and final
      base-scoped gate pass.
- [ ] No files outside Scope are modified.

## STOP conditions

- Plans 001 or 003 are incomplete or their run/persona artifact contracts
  conflict with this plan.
- Backward compatibility requires accepting incomplete objective vectors.

## Maintenance notes

Do not merge experiment admissibility and equilibrium into one boolean again.
Admissibility judges a tested move; equilibrium proves the enumerated candidate
set has no remaining admissible S/M move.
