---
type: Agent Skill Reference
title: "OptimizeXP features"
description: "Persona-driven Gherkin feature folders, --feature seed generation, and evidence layout."
tags: [hobo, optimizexp, features, gherkin, personas, feature-seed]
timestamp: 2026-07-30T00:00:00Z
---

# Features

Persona-driven behavior specs live under **scoped** feature trees:

| Scope | Path |
|---|---|
| **Global** | **`.optimizexp/features/<slug>/`** — cross-project journeys |
| **Project** | **`<project>/.optimizexp/features/<slug>/`** — journeys for that product only |

Each **feature is a folder**, not a lone `.feature` file. Generation via **`--feature "seed"`** produces **one Gherkin file per targeted persona**, sharing one evidence tree in that same folder.

**Write scope:** single non-root `--project site` → `site/.optimizexp/features/`; `--projects all` / multi / root → global. **Read scope:** merge global + selected projects; project-local id **shadows** global.

## Layout

```text
# global
.optimizexp/features/<feature-slug>/
# or project-local
site/.optimizexp/features/<feature-slug>/
  README.md
  SEED.md                   # verbatim journey seed when generated
  feature.json              # machine metadata (schemaVersion: 1; scope + projects)
  <feature-slug>-<persona>.feature   # REQUIRED per targeted persona
  steps/
    world.ts
    bindings.steps.ts
    implementations.ts
    discovery.json
  test/
    <feature-slug>.bindings.test.ts
  evidence/
    <scenario-slug>/        # ONE primary recording per scenario
```

Scenario slugs must be unique **across** persona files in the same feature (include persona in the scenario title when needed).

## feature.json

```json
{
  "schemaVersion": 1,
  "id": "agent-check-staged",
  "title": "Staged agent check feedback",
  "experiences": ["dx", "ax"],
  "projects": ["root"],
  "scope": "global",
  "personas": ["developer", "coding-agent"],
  "interfaces": ["cli", "mcp"],
  "driver": "cli",
  "surfaces": ["pnpm agent:check -- --staged"],
  "tags": ["@optimizexp", "@dx"],
  "generatedFromSeed": true,
  "seedDigest": "b858ed212a981b39",
  "personaResolution": "explicit --personas"
}
```

`scope` is `global` or a project id (matches the folder that owns the feature).  
`projects` tags which multi-project unit(s) the journey belongs to (`root`, `site`, `cli`, example ids, …). Default when omitted: treat as **`root`**. Review with `--projects site` loads **global + `site/.optimizexp`** features/personas.

## Generate from `--feature` seed

### Bulk bootstrap

Prefer **`--init`** (`references/init.md`) to discover product journeys and scaffold many features at once. Use `--feature` for one-off journeys.

### When

```text
/optimizexp --feature "Staged agent check after a skill edit gives clear next steps"
/optimizexp --feature-seed "…" --feature-id agent-check-staged
/optimizexp --feature-file journey.txt --personas developer
```

Flags: `references/flags.md`.

### Persona fan-out (think carefully)

The set of personas is **not** “always everyone” and **not** “always one default.” It is the **same persona selection** as the review loop:

| Condition | Feature files generated for |
|---|---|
| No persona flags | Every on-disk persona intersecting resolved experiences (default experiences = all three → effectively all personas with any of ux/dx/ax) |
| `--personas a,b` | Only `a` and `b` |
| Only `--persona` seeds this run | Only newly generated persona ids |
| `--max-personas N` | First N after priority sort |

**Why per-persona files (not one file with all scenarios)?**

1. **Judgment attribution** — scorecards and feelings are per persona; Gherkin should match that grain.
2. **Vocabulary** — developer “gate” vs end-user “error message” vs designer “contrast.”
3. **Interfaces** — coding-agent may use `mcp`; designer may use `web`.
4. **Evidence** — scenario names stay stable; persona in the title avoids collisions.
5. **Partial regen** — regenerating for `--personas developer` must not wipe `*-designer.feature`.

**Shared folder** still means one product journey, one `feature.json`, one `evidence/` tree.

### Process (agent)

1. Resolve experiences + personas (`references/flags.md` algorithm). Generate any `--persona` seeds **first**.
2. For each `--feature` seed:
   - Derive id (`--feature-id` or kebab-case from seed).
   - Scaffold with harness (Gherkin **and** bindings/tests).
   - **Rewrite** each per-persona `.feature` so steps match `.optimizexp/personas/<id>.md`.
   - Put verbatim seed in `SEED.md` / README.
3. **Bindings & implementations** (automatic + agent refinement):
   - Harness runs **code discovery** (`package.json` scripts, backtick commands in Gherkin/seed, known paths).
   - If a real script/command exists → wire `exerciseSurface` / `observeFailure` to run it (capture exit/stdout/stderr).
   - If nothing solid exists → leave **stubs** (`IMPLEMENTATION_STATUS.stub`) and treat as friction/uncertainty finding — **do not fake green**.
   - Never call live third-party services from default steps.
4. Validate: `generate-feature.mts --mode validate --id <id>`.
5. Smoke: `pnpm run test:file .optimizexp/features/<id>/test/<id>.bindings.test.ts`.
6. Optional cucumber: `.optimizexp/cucumber.yaml`.
7. Record `generatedFeatures[]` in `scope.json` (include `implementationStatus` / `primaryCommand` when set).
8. Continue review loop: bus expect/act/outcome cite `featureId` + `scenarioSlug` + persona.

### Harness

```bash
node --import tsx .agents/skills/optimizexp/harness/generate-feature.mts \
  --mode resolve-personas --experiences dx

node --import tsx .agents/skills/optimizexp/harness/generate-feature.mts \
  --seed "Staged agent check is narrow and actionable" \
  --id agent-check-staged \
  --experiences dx \
  --personas developer,coding-agent

# re-scan repo and rewrite implementations.ts from discovery
node --import tsx .agents/skills/optimizexp/harness/generate-feature.mts \
  --mode implement --id agent-check-staged

node --import tsx .agents/skills/optimizexp/harness/generate-feature.mts \
  --mode validate --id agent-check-staged

pnpm run test:file .optimizexp/features/agent-check-staged/test/agent-check-staged.bindings.test.ts
```

### Regeneration rules

- Overwrite `<feature>-<persona>.feature` for personas in the current target set.
- Leave other persona files untouched unless the user asks to prune.
- **Never** delete `evidence/` on regenerate.
- Update `feature.json.personas` to the union of personas that still have files (or the current target set — prefer **union** so evidence owners remain listed).

## Gherkin conventions

1. File-level tags: `@optimizexp` + experience tags + `@persona:<id>` + `@interface:<iface>`
2. `Background:` activates the persona
3. Scenario names stable → scenario-slug for evidence
4. Prefer ≥2 scenarios: happy path + failure/recovery
5. Steps are observable; judgment criteria live in persona.md + scorecards

Example file `agent-check-staged-developer.feature`:

```gherkin
@optimizexp @dx @persona:developer @interface:cli
Feature: Staged agent check feedback (developer)
  As developer
  I want narrow gates after a staged skill edit
  So that I am not forced through full-repo validation

  Background:
    Given persona "developer" is active
    And feature "agent-check-staged" is under optimizexp review

  Scenario: Staged skill edit selects skill gates for developer
    Given I have staged only skill files under optimizexp
    When I run `pnpm agent:check -- --staged`
    Then the selected gates include skill-related checks
    And failing paths are named when any
```

## Evidence

See `references/evidence.md`. Capture is per **scenario**, not per persona file — keep scenario names unique across the feature folder.

## Relation to product cucumber

OptimizeXP features are **experience-review** specs. Epic proofs still use `pnpm run test:behavior`. These Gherkin files drive persona judgment + harness evidence, not production acceptance alone.
