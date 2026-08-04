# Plan 004: Generate persona-specific executable scenarios

> **Executor instructions**: Run each verification and stop on a STOP condition.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat f14f1be2 -- .agents/skills/optimizexp/harness .agents/skills/optimizexp/references .claude/skills/optimizexp docs/agent-tooling.md`
> and
> `git status --short -- .agents/skills/optimizexp/harness .agents/skills/optimizexp/references .claude/skills/optimizexp docs/agent-tooling.md`.
> Reconcile plans 001 and 003 before changing persona consumption.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-certify-real-optimizexp-experiments.md`,
  `plans/003-ground-persona-generation.md`
- **Category**: bug
- **Planned at**: commit `f14f1be2`, 2026-07-31

## Why this matters

Feature fan-out currently generates renamed copies of one journey template.
The generator does not read persona bodies, `from-catalog` scaffolds before a
human accepts `EXPERIENCE.md`, and validators accept generic visible assertions.
That prevents personas from exercising their actual jobs or producing distinct
feedback, even when the files look complete.

## Current state

- `harness/generate-feature.mts:227-256` passes only persona ID/name,
  interfaces, and experiences into `gherkinTemplate`; it never consumes goals,
  constraints, vocabulary, thresholds, or catalog rows for that persona.
- `harness/lib/feature-quality.mts:200-330` supplies generic scenarios such as
  “critical path described by the feature seed,” “product chrome,” and “next
  action is obvious.” The validator at lines 91-137 accepts these templates.
- `harness/generate-feature.mts:453-481` reads one `EXPERIENCE.md` command and
  emits that same scenario set for every persona.
- `harness/generate-feature.mts:840-915` groups catalog rows by feature, plans
  one primary row, and calls scaffold immediately even when the plan is still
  TODO/revise.
- `harness/lib/feature-quality.mts:40-65` counts six checked boxes and searches
  for any `accept|revise|reject` token; it does not require all named markers or
  a verdict of exactly `accept`.
- `harness/lib/bindings-gen.mts:213-225` does not register an initialized
  Cucumber World and implements only a small generic phrase set, not all phrases
  emitted by the templates.
- `harness/generate-feature.mts:646-727` validates text and file presence but
  never executes the selected feature, so undefined/ambiguous steps pass.
- `harness/lib/surface-map.mts:298-315` invents fallback verbs and slash commands
  after failed discovery; `experience-catalog.mts:250-305` can then promote a
  persona wish into an executable row without observed product provenance.
- Live read-only evidence:
  `packages/code/.optimizexp/features/hobo-code-interactive-shell/*-advanced-nix-devenv-developer.feature`
  and `*-claude-code-advanced-app-builder.feature` differ only in persona IDs;
  lines 11-35 contain identical scenarios. `generate-feature --mode validate`
  nevertheless reports that feature clean.
- Doctor and single-feature validation diverge: doctor reported the current code
  scope clean while `generate-feature validate --projects code` found four
  keyword-trap discovery primaries.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Feature tests | `node --import tsx --test .agents/skills/optimizexp/harness/test/feature-quality.test.mts` | exit 0 |
| Generation tests | `node --import tsx --test .agents/skills/optimizexp/harness/test/feature-generation.test.mts` | exit 0 |
| Focused Cucumber | `node --import tsx --test .agents/skills/optimizexp/harness/test/feature-execution.test.mts` | exit 0; generated fixture has zero undefined, pending, ambiguous, or failed steps |
| Doctor tests | `node --import tsx --test .agents/skills/optimizexp/harness/test/doctor.test.mts` | exit 0 |
| Mirrors | `pnpm run skills:mirror-check` | exit 0 |
| Staged gate | `pnpm agent:check -- --staged` | exit 0 |

## Scope

**In scope**:

- `.agents/skills/optimizexp/harness/generate-feature.mts`
- `.agents/skills/optimizexp/harness/build-feature-coverage.mts`
- `.agents/skills/optimizexp/harness/lib/{feature-audit,feature-quality,experience-catalog,doctor,bindings-gen,code-discovery}.mts`
- `.agents/skills/optimizexp/harness/test/{feature-quality,feature-generation,feature-execution,doctor}.test.mts`
- `.agents/skills/optimizexp/references/{features,feature-quality,app-exploration,harness,doctor}.md`
- Matching `.claude/skills/optimizexp/**` files
- `docs/agent-tooling.md`
- `plans/README.md` (status row only)

**Out of scope**: rewriting live `.optimizexp/**` or `packages/code/**`
artifacts, product CLI fixes, external browser services, and new dependencies.

## Git workflow

- Branch: `advisor/004-optimizexp-persona-scenarios`
- Commit example: `fix(optimizexp): generate persona-specific scenarios`.
- Do not push or open a PR unless instructed.
- Before each incremental commit, stage only that step's in-scope files plus the
  status row when it changes, then run `pnpm agent:check -- --staged`.
- Before declaring the branch complete, run `git fetch origin`, rebase on
  `origin/main`, then run `pnpm agent:check -- --base=origin/main`.

## Steps

### Step 1: Add semantic negative fixtures

Add tests that reject: renamed-copy persona files, exact shared scenarios with
only IDs changed, generic `product chrome`/`obvious next action` assertions,
catalog rows missing from a persona's scenarios, a six-of-nine checklist,
`accept | revise | reject` as a fake verdict, scaffold before acceptance, and
doctor/validate disagreement.

Add one positive fixture where two personas share a product path but have
different setup, failure, vocabulary, and visible assertions.

**Verify**: new cases fail against current implementation for semantic reasons.

### Step 2: Build a persona-by-journey generation input

For every targeted persona, load plan 003's parsed model and every catalog row
for that persona plus feature ID. Build scenarios from exact entry action,
observable success/failure, confusion risks, persona job, constraints,
vocabulary, and threshold-sensitive risks. Shared setup may be reused, but each
persona file needs at least one materially distinct Given/Then or an explicit
`sharedJourneyBecause` rationale validated against identical job constraints.

**Verify**: generation tests show stable, deterministic, materially distinct
files for distinct persona fixtures.

Keep surface provenance explicit: `observed`, `probed`, `documented`, or
`desired`. Only observed/probed commands may become executable scenarios.
Documented-only paths need a verification probe. Desired-but-missing paths stay
in `experience-catalog.json` as `surfaceStatus: "desired"` and
`executable: false`; they cannot become Gherkin or evidence. When a run exists,
plan 001's survey/backlog path may promote the catalog gap ID into that run's
candidate ledger. Feature generation itself must not invent a run ID or write a
global backlog.

### Step 3: Make planning a hard precondition

Require `EXPERIENCE.md` to answer all eight numbered questions, check all nine
named adversarial markers, contain no TODO/template sentinel, declare an exact
`accept` verdict, and enumerate the targeted persona IDs and scenario intents.
`scaffold` and `from-catalog` must fail before writing Gherkin when this gate is
not satisfied. Keep `--force-low-quality` only as an explicit artifact-building
escape hatch that marks the feature ineligible for review and completion.

**Verify**: tests prove no `.feature` file is written on failed precondition.

### Step 4: Strengthen executable and observable quality

Require every scenario to map to a catalog experience ID, an exact driver
action/binding, concrete expected output fragments or state predicates, and a
failure/recovery result. Reject vague adjectives without a named observable.
Require scenario-to-binding coverage; `implementationStatus: wired` alone is
not enough.

Register and initialize the Cucumber World once, generate bindings for every
emitted phrase, and avoid importing duplicate feature-local definitions into a
whole-suite profile. Make `validate --id <feature>` execute that selected
feature and reject undefined, pending, ambiguous, or failed steps.

Add a normalized semantic fingerprint that removes persona IDs/titles. Reject
all-identical fingerprints across distinct persona jobs unless the explicit
shared-journey rationale passes.

**Verify**: tests reject the current clone shape and accept genuinely shared
plus distinct paths; a generated two-persona fixture runs through Cucumber with
zero undefined, pending, ambiguous, or failed steps.

### Step 5: Unify doctor, validate, and completion coverage

Expose one feature audit function used by doctor, `generate-feature validate`,
and a new `build-feature-coverage.mts` command that writes plan 001's run-scoped
`feature-coverage.json` contract. Include discovery-primary checks,
rubber-duck, semantic clone detection, catalog coverage, binding coverage, and
evidence eligibility in all three callers. Completion remains a consumer of
this file through plan 001; this plan does not edit the review-loop state
machine.

Update references/docs and mirrors.

**Verify**: all command-table commands exit 0 and synthetic doctor/validate
reports contain the same problem IDs.

## Test plan

Use temporary scoped `.optimizexp` trees. Cover multi-persona catalog rows,
shared-path rationale, clone fingerprints, exact acceptance, all checklist
markers, no-write failure, concrete observables, binding coverage, keyword
traps, observed-vs-desired provenance, initialized World state, focused Cucumber
execution, and doctor parity.

## Done criteria

- [ ] Distinct persona jobs cannot yield renamed-copy scenarios unnoticed.
- [ ] No Gherkin is scaffolded before an accepted complete experience plan.
- [ ] Every scenario traces to persona, catalog row, action, observable, and binding.
- [ ] Validator-approved generated scenarios execute in focused Cucumber.
- [ ] Desired or invented commands cannot satisfy executable coverage.
- [ ] Doctor, validate, and completion use the same feature audit.
- [ ] Existing live OptimizeXP artifacts remain untouched.
- [ ] Focused tests including the exact Cucumber execution case, mirrors,
      staged checks before each commit, and final base-scoped gate pass.
- [ ] No files outside Scope are modified.

## STOP conditions

- Plan 003's parsed persona contract is unavailable.
- Existing consumers require scaffold to write low-quality Gherkin silently.
- Semantic fingerprinting rejects legitimately shared paths and no explicit,
  testable rationale can distinguish them.

## Maintenance notes

Do not solve clone detection with a list of banned phrases. The durable test is
traceability from persona job and catalog row to materially observable scenario
behavior.
