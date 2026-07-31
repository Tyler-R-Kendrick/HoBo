---
type: Agent Skill Reference
title: "OptimizeXP feature quality (critical path)"
description: "Experience catalog, rubber-duck + adversarial EXPERIENCE.md, high-quality Gherkin bars, and bans on template-only features."
tags: [hobo, optimizexp, features, rubber-duck, adversarial, quality]
timestamp: 2026-07-31T00:00:00Z
---

# Feature quality — the critical path

**Experience quality is determined at feature generation time**, not at scoring time.

If features omit default entry / chat / help, personas cannot judge the real product. Exploration and evidence gates **enforce** quality; they do not replace a thorough feature-generation pipeline.

## Pipeline

```text
surface-map (explore) → experience-catalog → EXPERIENCE.md
  → rubberduck-check → scaffold Gherkin → validate quality → wire discovery
```

**Illegal:** write or regenerate `.feature` files without a passing `rubberduck-check` (unless `--force-low-quality`, which **blocks** assert-complete).

## Experience catalog

Artifact: `<project>/.optimizexp/experience-catalog.json` (+ optional `EXPERIENCE-CATALOG.md`).

Each row:

| Field | Meaning |
|---|---|
| `experienceId` | Stable slug |
| `personaId` | Who lives this |
| `intent` | Job-to-be-done (one sentence) |
| `entryCommand` | Exact cold command or TUI path |
| `driver` | `cli` \| `tui` \| `web` \| `native` |
| `observableSuccess` | What they **see** when it works |
| `observableFailure` | What they **see** when it fails |
| `confusionRisks` | Wrong product twins |
| `priority` | `P0` \| `P1` \| `P2` |
| `featureId` | Target feature folder id (once planned) |

### Mandatory P0 rules

1. **Default entry** — whatever the user types first for this product binary.  
2. **If interactive** — chat/TUI cold-start + in-session discoverability.  
3. **Help / verb list** — one-shot discoverability.  
4. **Happy critical path** — persona primary goal.  
5. **Failure/recovery** — actionable next step.  
6. **Persona stack** — each persona Goals / Configuration maps to ≥1 experience.

**Gate:** every selected persona has ≥1 P0 before scaffolding features.

## EXPERIENCE.md (rubber-duck + adversarial)

Required path: `features/<id>/EXPERIENCE.md`.

### Rubber-duck (must answer all 8)

1. Who is the persona and what do they finish in the next 2 minutes?  
2. Exact command / UI path from a clean machine?  
3. What do they see first? (quote expected chrome)  
4. What would make them think they opened the wrong product?  
5. Happy path step-by-step (prose Given/When/Then).  
6. Failure path: how they break it; what the product must say.  
7. Evidence that proves a human/agent actually ran this (driver + command).  
8. Deliberate out-of-scope.

### Adversarial critique (all boxes must be `[x]`)

- [ ] Did not skip default entry because a secondary verb is easier  
- [ ] Not testing a monorepo script instead of the product binary  
- [ ] No When-step is only “exercise the surface” without a real command  
- [ ] Scores cannot be invented without reading stdout/TUI  
- [ ] Persona vocabulary/asserts considered for shared paths  
- [ ] Security: secrets / destructive / network fail-closed  
- [ ] Cognitive load within persona thresholds  
- [ ] Confusion twin covered (stock UI, wrong binary, wrong verb)  
- [ ] If this were the only feature, the persona would not still be lost  

### Verdict

```markdown
## Verdict
- accept | revise | reject
- primaryCommand: …
- driver: cli|tui|web|native
- scenarios: …
```

Harness: `generate-feature.mts --mode rubberduck-check --id <feature>` fails if sections missing, adversarial unchecked, or rubber-duck answers too short.

## Gherkin quality bar

Validate **hard-fails** when:

| Ban | Why |
|---|---|
| Sole When is “I exercise the surface as this persona would” | Not executable / not specific |
| Sole Then is “I receive clear status…” without concrete assert | Scores inventable |
| No backtick command and no named TUI action | No live exercise |
| `<2` scenarios (P0 default-entry/chat need ≥3) | Incomplete journey |
| `primaryCommand` unrelated to catalog/surface-map | Wrong surface |

### Required positive patterns

- Concrete `When I run \`…\`` **or** `When I start bare TTY <bin>` / `When I run slash command /…`  
- Then steps name **visible** fragments (panel titles, “not stock Pi”, remediation verbs)  
- Tags: `@optimizexp` + experiences + `@persona:` + `@interface:`  
- Happy + failure (+ discoverability for P0 entry/chat)

## Templates (experience kinds)

| Kind | Use |
|---|---|
| `default-entry-tui` | Bare TTY interactive |
| `default-entry-cli` | Bare non-TTY / one-shot default |
| `help-discoverability` | help / --help / verb list |
| `inventory-verb` | status/agent/config/cost-style |
| `stack-config` | persona preferred stack |
| `failure-actionable` | bad args / fail closed |

## Discovery preference (bindings)

1. Catalog / EXPERIENCE.md `primaryCommand`  
2. Surface-map commands / project `package.json` bin  
3. Explicit Gherkin backticks matching product  
4. Same-package scripts only if listed on surface-map  
5. **Never** promote root monorepo `agent:check` / `eval:agent:*` for product journeys unless catalog entryCommand says so  

## Coverage matrix

`runs/<runId>/feature-coverage.json` must show:

- every selected persona → ≥1 P0 experience → feature + scenarios  
- `requiredP0Uncovered: []`  
- `featuresWithoutRubberduck: []`  
- `featuresWithTemplateOnlySteps: []`  

assert-complete fails otherwise.

## Agent protocol

### Rubber-duck mode

Narrate EXPERIENCE.md; walk scenarios with **literal** expected output fragments; name the one transcript moment a skeptic needs; revise if you cannot.

### Adversarial mode

Assume: “You only automated what was easy,” “You never opened default entry,” “Gherkin is cargo-cult,” “Evidence is handwritten.” Disprove with catalog + command + capture plan, or add a feature.
