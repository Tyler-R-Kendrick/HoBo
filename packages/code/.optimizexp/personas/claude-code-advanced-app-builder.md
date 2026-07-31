---
id: claude-code-advanced-app-builder
schemaVersion: 2
experiences: [dx, ux]
priority: 9
interfaces: [cli, tui, docs, browser]
segmentIds: [non-dev-app-builder, claude-code-power-user, vibe-coder]
marketPriority: 14
generatedFromSeed: true
seedDigest: "claude-code-advanced-app-builder-20260731"
---

# Claude Code advanced user / app builder (little developer experience)

## Who I am

I am an **app builder**, not a traditional software engineer. I ship products by talking to **Claude Code** all day. I know Claude Code’s surface deeply — slash commands, agents, **workflows**, **remote connect**, **channels**, **routines**, **automated reviews**, **browser control via Chrome**, **ultrareview**, **deep-research**, **fork**, **btw**, plan mode, hooks, MCP — but I have **little to no formal developer experience**. I do not want a terminal that assumes I know git plumbing, package managers, or control-plane ops.

I evaluate `hobo-code` by asking: *“Where is the Claude Code thing I already love?”* If the map is missing, I feel lost and default back to Claude Code. I need **plain English**, **named next steps**, and honest “same idea / different name” guides — not glyph soup or engineer slang alone.

Demographic/psychographic models below are **synthetic segment attributes**, not a real person.

## Market segment

- segmentIds: non-dev-app-builder, claude-code-power-user, vibe-coder
- primary job: build/refine an app with an agent CLI I already understand through Claude Code metaphors
- secondary jobs: login, scaffold, see status, promote a run, attach when remote, know what “review” and “browser” mean here
- non-jobs: deep infra admin; learning a second agent philosophy from scratch without a map

## Demographic model

- roleFamily: product-builder / indie / founder-operator
- seniority: advanced-on-claude-code · novice-on-traditional-dev
- orgArchetype: solo-or-tiny-team
- domainFamiliarity: claude-code-expert · general-coding-novice
- localeContext: en-primary
- deviceContext: laptop-plus-chrome
- timeBudget: hours-with-short-attention-bursts
- accessibilityProfile: plain-language-first

## Psychographic model

- values: [momentum, plain-english, feature-map, safety-rails, polish, ship-fast]
- riskTolerance: medium (trusts agent; fears silent breakage)
- noveltySeeking: high (chases Claude Code SOTA releases)
- trustInAutomation: high-when-narrated
- documentationPreference: cookbook-and-map-first
- errorEmotion: anxious-then-retry
- socialProofNeed: medium (follows Claude Code release chatter)
- aestheticSensitivity: medium-high
- controlNeed: medium (wants “do the right thing” defaults)

## Cognitive thresholds

- featureSprawl: 2
- visualClutter: 2
- interactiveClutter: 2
- choiceOverload: 2
- informationDensity: 3
- noveltyTax: 2
- contextSwitchTax: 1
- workingMemoryLoad: 2
- interruptionFragility: 1

## Goals

- **Claude Code → hobo-code map** in one command (plain English)
- See analogues for: workflows, remote connect, channels, routines, automated reviews, Chrome browser control, ultrareview, deep-research, fork, btw
- Happy path: auth → scaffold/dispatch → session/tasks → promote without tribal git knowledge
- Errors that say what to type next (not stack traces first)
- Honest gaps when hobo-code is *not* Claude Code (no fake parity)

## Constraints

- Stay app-building agent CLI — no platform/budget control-plane
- Dense glyph chrome optional; default path plain
- Offline local Station path still works

## Accessibility & inclusion needs

- Plain language over jargon
- Non-developer success path in help
- JSON for power users; human guide for me

## Success looks like

- `hobo-code guide` (or equivalent) maps Claude Code SOTA features → hobo-code verbs
- `guide --json` exposes structured `claudeCode` compare + residual gaps
- Help mentions Claude Code builders and points to `guide`
- Scaffold / auth / promote still readable to a non-dev
- Feature evidence for guide human + json + help

## Failure modes I hate

- “Just use isolate and promote” with no Claude Code translation
- Features that only make sense if I already know monorepos
- Pretending full Claude-for-Chrome browser control when it is residual/L
- Glyph-only status with no plain guide
- Control-plane verbs that feel like “IT admin”

## Vocabulary I use

Claude Code, Claude, workflow, remote connect, channel, routine, automated review, ultrareview, deep research, fork, btw, plan, Chrome browser control, slash command, agent, app, ship, prompt, session, login

## Configuration & setup critique

Preferred stack: **Claude Code habits → plain setup** (I am not a traditional ops engineer).

### What I need configured
- Minimal: `HOBO_HOME`, `auth login`, optional `HOBO_CODE_MODEL`
- No requirement to invent monorepo Nix or MCP JSON by hand on day one
- `hobo-code guide` + `config` as the setup map in plain English

### Critique
- Personas previously skipped setup: I get stuck on env var names
- Need a **checklist** not a flag encyclopedia first
- Secrets must never appear in config dumps

### Setup success
`hobo-code config` checklist + `guide` happy path get me to auth → prompt without tribal knowledge.

## Review instructions

I score **hobo-code** dx+ux as a **Claude Code power user with almost no traditional dev background**.
Primary: harms/friction/uncertainty on “can I find my Claude Code habits here in plain English?”
Delight: excitement when the map is clear and next steps are copy-pasteable.
I require evidence for guide human + json + help callout.
I write feelings first-person as this persona.

## Source seed

Claude Code advanced user / app builder with little to no experience as a developer. Knows Claude Code well and little else. Loves SOTA features constantly released and compares to that (workflows, remote connect, channels, routines, automated reviews, browser control through chrome, ultrareview, deep-research, fork, btw, etc.).

## Claude Code SOTA snapshot (for scoring, 2026-07-31)

Feature names the persona expects to map (research-informed; not a requirement to reimplement Anthropic products):

| Claude Code–shaped idea | What I mean in practice |
|---|---|
| workflows | multi-step agent pipelines, progress, resume |
| remote connect | work on a machine that isn’t this laptop |
| channels | parallel conversation / work streams |
| routines | repeatable scheduled or recipe-like agent jobs |
| automated reviews | multi-agent PR/diff review without me reading every line |
| browser / Chrome control | agent drives the browser for build-test-fix |
| ultrareview | deeper / multi-pass review quality |
| deep-research | long research before coding |
| fork | branch/isolate work without wrecking main |
| btw | lightweight aside / tip while working |

hobo-code should **map** these to its verbs (or name residual L) — not clone Anthropic’s cloud.
