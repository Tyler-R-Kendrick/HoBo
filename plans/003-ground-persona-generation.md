# Plan 003: Generate grounded, diverse persona instruments

> **Executor instructions**: Execute each step and verification exactly. Stop
> rather than guessing if the product evidence cannot support a persona field.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat f14f1be2 -- .agents/skills/optimizexp/harness .agents/skills/optimizexp/references .claude/skills/optimizexp docs/agent-tooling.md`
> and
> `git status --short -- .agents/skills/optimizexp/harness .agents/skills/optimizexp/references .claude/skills/optimizexp docs/agent-tooling.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `f14f1be2`, 2026-07-31

## Why this matters

Generated personas are currently long but mostly identical defaults: mid-level,
startup, medium risk/novelty/trust, and the same cognitive thresholds. Structural
validation sees headings, not whether the profile is grounded or internally
coherent. Persona selection then sorts mostly by priority rather than the
documented diversity cover set. A verbose clone cannot supply distinct feedback.

## Current state

- `harness/generate-persona.mts:119-164` derives experiences and interfaces from
  keyword regexes and defaults an unmatched seed to DX.
- `harness/generate-persona.mts:178-293` emits fixed demographic,
  psychographic, threshold, goal, constraint, and failure-mode content. Only
  experiences and one aesthetic threshold materially vary.
- `harness/generate-persona.mts:339-389` validates frontmatter and heading
  presence but not field enums, values, non-empty sections, seed grounding,
  model coherence, or stereotypes.
- `harness/lib/persona-resolve.mts:173-205` lets explicit/generated IDs through
  without full persona validation; automatic selection only checks the
  experience list.
- `harness/lib/persona-resolve.mts:217-233` sorts by `priority` and truncates,
  ignoring the `marketPriority` plus diversity rule documented at
  `references/persona-models.md:150-156`.
- `.optimizexp/personas/product-app-developer.md:28-61` demonstrates the common
  synthetic defaults. Hand-refined project personas show that useful profiles
  need product-specific jobs, non-jobs, vocabulary, setup, and thresholds.
- Existing reusable inputs: `repo-discover.mts` product signals,
  `experience-catalog.json`, persona frontmatter parser, and current v2 sections.
  Do not add an embedded LLM client.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Persona tests | `node --import tsx --test .agents/skills/optimizexp/harness/test/persona-generation.test.mts` | exit 0 |
| Existing doctor tests | `node --import tsx --test .agents/skills/optimizexp/harness/test/doctor.test.mts` | exit 0 |
| Mirrors | `pnpm run skills:mirror-check` | exit 0 |
| Staged gate | `pnpm agent:check -- --staged` | exit 0 |

## Scope

**In scope**:

- `.agents/skills/optimizexp/harness/generate-persona.mts`
- `.agents/skills/optimizexp/harness/lib/{persona-model,persona-resolve,repo-discover,doctor}.mts`
- `.agents/skills/optimizexp/harness/init.mts`
- `.agents/skills/optimizexp/harness/test/{persona-generation,doctor}.test.mts`
- `.agents/skills/optimizexp/references/{persona-models,personas,cognitive-thresholds,init}.md`
- Matching `.claude/skills/optimizexp/**` files
- `docs/agent-tooling.md`
- `plans/README.md` (status row only)

**Out of scope**: real PII, external customer research, network/LLM calls,
existing persona artifact rewrites, and feature generation (plan 004).

## Git workflow

- Branch: `advisor/003-optimizexp-grounded-personas`
- Commit example: `feat(optimizexp): ground generated persona models`.
- Do not push or open a PR unless instructed.
- Before each incremental commit, stage only that step's in-scope files plus the
  status row when it changes, then run `pnpm agent:check -- --staged`.
- Before declaring the branch complete, run `git fetch origin`, rebase on
  `origin/main`, then run `pnpm agent:check -- --base=origin/main`.

## Steps

### Step 1: Characterize generation and validation failures

Add fixtures for a junior time-constrained CLI developer, a risk-averse agent
operator, a visual designer, and an ambiguous seed. Assert distinct jobs,
psychographics, thresholds, and vocabulary where evidence supports them. Add
negative fixtures for empty headings, invalid enums/thresholds, all-5 thresholds,
contradictory model pairs, copy-pasted default profiles, ungrounded claims, and
unsafe stereotype/PII patterns. Make these predicates structural: reject direct
email, phone, street-address, handle, and exact-employer fields; never infer a
protected trait; and require every non-unknown model value to cite either an
explicit seed span or an allowlisted work-constraint mapping. Protected traits
present verbatim in a requested seed remain quoted provenance, never a mapping
input.

**Verify**: the new tests fail against current generation for the intended
semantic reasons.

### Step 2: Separate facts, inferred fields, and unknowns

Parse the seed plus local product discovery into a small internal model. For
each structured field retain provenance (`seed`, `product-signal`, `default`,
or `needs-agent-judgment`). Do not invent `mid`, `startup`, or `medium` when the
seed is silent. Add an explicit `unspecified`/`needs-judgment` value to the
documented schema where necessary, or make the generator stop before a persona
becomes review-eligible.

Generate repo-specific primary job, non-jobs, surfaces, vocabulary, and
observable failure behavior from actual discovery/catalog inputs. Keep the seed
verbatim as data.

**Verify**: snapshot/structural assertions show grounded fields cite their
provenance and silent fields remain honestly unresolved.

### Step 3: Derive coherent psychographics and cognitive thresholds

Use a documented deterministic mapping from supported seed traits and job
constraints to psychographics and thresholds. Examples: low time budget lowers
information-density/working-memory tolerance; low automation trust tightens AX
uncertainty and control needs; high aesthetic sensitivity tightens visual
clutter. Preserve a calibration escape hatch in the persona file rather than
pretending these synthetic values are measurements.

Validate all enums, 0-5 thresholds, cross-field invariants, and rationales for
non-default values. Define a normalized profile fingerprint over job, non-jobs,
interfaces, vocabulary, demographic buckets, psychographics, and thresholds,
excluding IDs/titles/provenance ordering. Duplicate fingerprints require a
`sharedProfileBecause` rationale plus identical cited job-constraint source IDs;
otherwise reject them.

**Verify**: unit cases cover each mapping and contradictions.

### Step 4: Enforce review eligibility and diversity selection

Expose one reusable full persona validator and call it from generation,
selection, init, and doctor. Explicit IDs may select only valid personas; report
all problems with paths.

When capped, select a deterministic cover set by `marketPriority`, then unique
role family, then diversity across seniority/org/trust, then normal priority/id.
Do not add a generic optimization library.

**Verify**: tests prove invalid personas never run and a cap chooses a diverse
cover set rather than the first same-role files.

### Step 5: Publish one structured persona context contract

Add one shared builder in `persona-model.mts` that emits the selected job,
psychographic drivers, thresholds, vocabulary, provenance-backed constraints,
normalized fingerprint, full profile body, and stable digest. `init.mts` must
snapshot each active parsed profile/context plus its digest into initialization
artifacts so later edits cannot silently change the judgment instrument.

Downstream wiring is deliberately owned by the plans that already touch those
boundaries: plan 001 requires surveys to reference the digest; plan 002 loads it
for scorecards and equilibrium; plan 004 uses it for features/coverage; plan 005
quotes the context in host prompts. Do not expand this plan into those files.

Update references and docs, then mirror.

**Verify**: all command-table commands exit 0.

## Test plan

Use only synthetic seeds and temporary repos. Cover generation provenance,
unknowns, enum/threshold validation, coherence, clone detection, unsafe content,
full-validation selection, diversity caps, and prompt extraction.

## Done criteria

- [ ] Silent seed fields are not filled with plausible-looking stereotypes.
- [ ] Generated personas differ in grounded jobs, behavior, and model values.
- [ ] One full validator is reused by generate, init, doctor, and selection.
- [ ] Capped selection implements the documented diversity cover set.
- [ ] The shared context artifact includes parsed drivers, thresholds, body,
      provenance, fingerprint, and digest.
- [ ] Initialization artifacts snapshot every active profile digest for the
      downstream plans to consume.
- [ ] Focused tests, mirrors, staged checks before each commit, and final
      base-scoped gate pass.
- [ ] Existing `.optimizexp/personas/**` are untouched.

## STOP conditions

- Product discovery provides no evidence for a requested persona's primary job.
- Supporting unknown/provenance values would break an external persona consumer
  not covered by this repo.
- The proposed mapping encodes protected-trait stereotypes.

## Maintenance notes

These are synthetic instruments, not customer truth. Keep provenance visible
and recalibrate mappings when actual research becomes available; never silently
upgrade inference into fact.
