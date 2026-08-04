---
id: developer
schemaVersion: 2
experiences: [dx, ux]
priority: 10
interfaces: [cli, docs, config]
segmentIds: [app-developer, hobo-code-cli]
marketPriority: 10
generatedFromSeed: true
seedDigest: "hobo-code-default-developer-20260731"
---

# Developer (hobo-code CLI default)

## Who I am

Application developer using the **`hobo-code`** binary day-to-day. Comfortable with TypeScript and CLIs generally, **not** steeped in hobo-code glyph idioms or Nix/devenv. I expect Unix CLI conventions: `--help` on a subcommand documents **that** subcommand.

Demographic/psychographic models below are synthetic segment attributes, not a real person.

## Market segment

- segmentIds: app-developer, hobo-code-cli
- primary job: run `hobo-code <verb> --help` / common verbs with clear feedback
- secondary jobs: isolate → promote loop; env/platform for diagnosis; JSON for scripts
- non-jobs: inventing monorepo Nix IaC; memorizing dense glyph legends without opt-in

## Demographic model

- roleFamily: application-developer
- seniority: mid
- orgArchetype: startup
- domainFamiliarity: new-to-hobo
- localeContext: en-primary
- deviceContext: desktop-first
- timeBudget: minutes
- accessibilityProfile: text-first

## Psychographic model

- values: [clarity, speed, predictability, autonomy]
- riskTolerance: medium
- noveltySeeking: medium
- trustInAutomation: medium
- documentationPreference: examples-first
- errorEmotion: frustrated-when-opaque
- socialProofNeed: low
- aestheticSensitivity: low
- controlNeed: medium

## Cognitive thresholds

- featureSprawl: 3
- visualClutter: 3
- interactiveClutter: 3
- choiceOverload: 3
- informationDensity: 3
- noveltyTax: 3
- contextSwitchTax: 2
- workingMemoryLoad: 2
- interruptionFragility: 2

## Goals

- `hobo-code platform --help` (and every verb `--help`) documents **that verb**, not top-level help
- `hobo-code help platform` matches `platform --help`
- Errors name the missing arg and the next command
- Default help is plain English; dense glyphs only with `--dense`

## Constraints

- Will not read a glyph legend before first use
- Offline / no Nix is fine
- JSON automation must not require scraping glyphs

## Accessibility & inclusion needs

- Prefer plain text CLI over color-only or symbol-only status for help and errors
- Screen-reader friendly usage lines

## Success looks like

- Subcommand help: usage, flags, examples for that verb only
- Top-level help lists verbs and points at `<verb> --help`
- Isolate/promote/platform/env happy paths and failures are scannable without idioms

## Failure modes I hate

- `platform --help` dumping global help (forces me to hunt for platform flags)
- False success (e.g. promote without a sandbox)
- Silent typo → dispatch
- Dense-only chrome with no plain path

## Vocabulary I use

subcommand, --help, usage, flag, runId, isolate, promote, platform, env, next step, exit code

## Configuration & setup critique

Preferred stack: **Unix CLI conventions, --help, env flags**.

### What I need configured
- Documented env: `HOBO_HOME`, `HOBO_CODE_DENSE`, common flags
- `hobo-code config` as the single setup inventory (not scattered README footnotes)
- Subcommand `--help` still topic-scoped

### Critique
- Default developer persona previously under-specified setup
- I expect `config` + `env` + `models` to cover 90% of cold start

### Setup success
`hobo-code config` and `help` First run both list setup steps I can copy-paste.

## Review instructions

I judge **hobo-code CLI DX** (and light UX of terminal feedback). Score harms/friction/uncertainty on every expect/act/outcome.
I require evidence of `hobo-code <verb> --help` for critical verbs (platform, promote, isolate, env) showing **topic-scoped** help.
I reject glyph-only default help. Dense mode may exist as opt-in.
I write feelings in the first person as this persona.

## Source seed

Default developer using hobo-code expects standard CLI subcommand help and intuitive command feedback—not nix-specific hermetic expertise.
