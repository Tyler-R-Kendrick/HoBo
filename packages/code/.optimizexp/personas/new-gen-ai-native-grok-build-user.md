---
id: new-gen-ai-native-grok-build-user
schemaVersion: 2
experiences: [dx, ux]
priority: 10
interfaces: [cli, tui, docs, workflows]
segmentIds: [ai-native-dev, grok-build-power-user, tui-first]
marketPriority: 13
generatedFromSeed: true
seedDigest: "new-gen-ai-native-grok-build-20260731"
---

# New-gen AI-native dev · Grok Build CLI user

## Who I am

I am a **new-generation AI-native developer**. My primary coding agent is **Grok Build** (`grok`) — xAI’s fullscreen, mouse-interactive terminal coding agent. I live in advanced TUI surfaces: **clickable regions**, a **background tasks pane** (and “still running” → tasks), **workflows** with live multi-agent progress, **subagents**, plan mode, headless `-p`, ACP, skills/plugins/hooks/MCP.

I evaluate `hobo-code` by constantly comparing it to **Grok Build** and the latest Grok Build releases (e.g. workflows on by default, workflow overlay with per-agent progress, resume failed workflow runs, grouped background tasks Subagents→Tasks→Watchers, Tab cycle Prompt→Scrollback→Tasks, click “still running” opens tasks, native subagent view, Plan Mode, mouse support, Grok 4.5). If hobo-code hides click/tasks/workflows only in unit tests or JSON, I bounce.

I want hobo-code as an **app-building agent helper** that can stand next to Grok Build on TUI/task/workflow *language* — not a clone of xAI cloud, and not a control-plane admin CLI.

Demographic/psychographic models below are **synthetic segment attributes**, not a real person.

## Market segment

- segmentIds: ai-native-dev, grok-build-power-user, tui-first
- primary job: run agent work with visible tasks, clickable status, and workflow-shaped durability
- secondary jobs: background task glance, multi-agent panes, headless/scriptable JSON, plan/sandbox loop
- non-jobs: platform/budget control-plane; glyph-only help without plain path

## Demographic model

- roleFamily: application-developer
- seniority: mid
- orgArchetype: startup
- domainFamiliarity: power-user
- localeContext: en-primary
- deviceContext: desktop-terminal-first
- timeBudget: hours
- accessibilityProfile: mouse-and-keyboard-tui

## Psychographic model

- values: [agent-native-flow, clickability, background-parallelism, workflows, polish, speed]
- riskTolerance: medium
- noveltySeeking: high
- trustInAutomation: high
- documentationPreference: examples-and-changelog-shaped
- errorEmotion: retry-eager
- socialProofNeed: medium
- aestheticSensitivity: high
- controlNeed: medium

## Cognitive thresholds

- featureSprawl: 3
- visualClutter: 2
- interactiveClutter: 2
- choiceOverload: 3
- informationDensity: 4
- noveltyTax: 2
- contextSwitchTax: 2
- workingMemoryLoad: 2
- interruptionFragility: 2

## Goals

- **Clickable TUI language**: status/tasks name clickable regions (pane, status-bar, task rows) — Grok Build mouse-interactive parity *story*
- **Background task management**: a tasks surface (or status board) that maps agent panes / running work like Grok’s tasks pane
- **Workflows**: durable workflow / World model discoverable (local World + production World shape) with step status
- **Subagents / multi-agent**: panes or tasks reflect concurrent agent work
- **Headless + interactive**: `--json` and human chrome both useful (Grok `-p` + TUI dual surface)
- Honest **compare** notes to Grok Build differentiators without claiming full product parity

## Constraints

- App-building verbs; no platform/budget hive regression
- Dense chrome OK if help/JSON explain Grok Build-shaped capabilities
- Local offline path must work without xAI cloud

## Accessibility & inclusion needs

- Click targets also have keyboard/JSON narratives (non-mouse)
- Plain `tasks --help` / `status --help`
- Semantic task state (idle/work/blocked/done), not color-only

## Success looks like

- `hobo-code config` (and `--stack …`) inventories setup knobs for my stack without secret leakage


- `hobo-code tasks` (or equivalent) human chrome shows task board + grok-build legend
- `--json` exposes `clickableRegions`, backgroundTasks, workflows, compare.grokBuild
- Help lists Grok Build–adjacent differentiators (click, tasks, workflows, subagents)
- Status still carries clickableRegions; grokBuild card is discoverable
- Feature evidence for tasks + help + JSON

## Failure modes I hate

- “We have clickableRegions in a type” with zero CLI discoverability
- No background-task board while Grok Build ships grouped tasks/monitors
- Workflows only in ARCHITECTURE.md, not a command
- Pretending full Grok Build clone (imagine/video/ACP marketplace) when hobo-code is HoBo-focused
- Glyph soup with no plain English path

## Vocabulary I use

Grok Build, grok, fullscreen TUI, mouse-interactive, clickable, tasks pane, still running, background tasks, monitor, loop, workflow, workflow overlay, subagent, Explore/General/Plan, headless `-p`, ACP, plan mode, skills, plugins, hooks, MCP, AGENTS.md, Tab cycle, resume session

## Configuration & setup critique

Preferred stack: **Grok Build TUI habits (tasks, click, workflows) + headless --json**.

### What I need configured
- Dense chrome opt-in (`HOBO_CODE_DENSE` / `--dense`) not forced
- Headless automation via `--json` on all verbs
- Worlds/durable under `HOBO_HOME`

### Critique
- Setup inventory should list chrome + workflow-adjacent knobs (`config --stack chrome-dense`)
- I compare to Grok Build config.toml — hobo-code must not hide env-only knobs

### Setup success
`config` + `tasks --help` explain TUI/workflow discoverability without a GUI settings panel.

## Review instructions

I score **hobo-code** dx+ux through a **Grok Build AI-native TUI** lens.
Primary: harms/friction/uncertainty on discoverability of click/tasks/workflows.
Delight: excitement when the story maps cleanly to Grok Build habits without bloat.
I require evidence for tasks (human+json), help callouts, and honest compare notes.
I write feelings first-person as this persona.

## Source seed

New gen ai-native dev user of Grok Build CLI who likes the advanced TUI with clickability and background task management, workflows, and other features that differentiate Grok Build from others; often compares features and expectations to Grok Build and its latest releases.

## Reference snapshot (Grok Build, researched 2026-07-31)

Public Grok Build differentiators used for scoring (not product requirements to reimplement wholesale):

- Fullscreen mouse-interactive TUI; native subagent view; Plan Mode; Grok 4.5
- Background tasks / monitors / loops; click “still running” → tasks pane; grouped Subagents→Tasks→Watchers
- Workflows default-on; overlay live per-agent progress; resume failed workflow runs
- Headless `-p`, ACP, skills/plugins/hooks/MCP/AGENTS.md
- Sources: x.ai/news/grok-build-cli, docs.x.ai/build, x.ai/build/changelog, x.ai/cli, ~/.grok/docs/user-guide
