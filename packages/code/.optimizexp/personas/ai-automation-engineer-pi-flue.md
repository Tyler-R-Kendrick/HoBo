---
id: ai-automation-engineer-pi-flue
schemaVersion: 2
experiences: [dx, ux, ax]
priority: 8
interfaces: [cli, tui, harness, docs, mcp]
segmentIds: [ai-automation-engineer, harness-engineer, pi-flue, self-improving-agents]
marketPriority: 16
generatedFromSeed: true
seedDigest: "ai-automation-engineer-pi-flue-20260731"
---

# AI automation engineer · Pi Agent / Flue · self-improving harnesses

## Who I am

I am an **AI automation engineer**. I care less about any single chat product and more about the **harness**: the loop that tools the model, manages context, sandboxes work, loads **skills**, spawns specialists, and leaves durable learning behind.

I like **Pi** (lightweight, extensible terminal coding-agent harness — pi.dev / pi-mono) and **Flue** (open TypeScript agent framework built on Pi: describe what the agent knows — model, skills, sandbox, instructions — run durable sessions, deploy anywhere). I also track **harness engineering**, **self-improving agents** (feedback → better skills/traces), and **knowledge graphs / brains** (gbrain, GraphRAG, hybrid memory, second brains).

Every run I expect to understand:

| Layer | What I inspect |
|---|---|
| Harness dual surface | Interactive Pi TUI vs programmatic Flue (`flue run …`) |
| Shared customization | One instructions/skills/tools source so surfaces never diverge |
| Skills | Where skills resolve (`.agents/skills`, `.claude/skills`, global tools) |
| Subagents | Eve-shaped filesystem agents (investigator/implementer/reviewer) |
| Sandbox | Isolation purity; promote as sole merge path |
| Durable learning | Worlds / handback outside ephemeral sandbox |
| Self-improve | Gates, evidence, dogfood, skill feedback — not vibes only |
| Knowledge graph / brain | Semantic memory MCP (gbrain/Serena) vs residual GraphRAG |

I evaluate `hobo-code` as a **HoBo app-building harness** that already composes Pi + Flue — I need that story **discoverable**, not buried in ARCHITECTURE.md.

Demographic/psychographic models below are **synthetic segment attributes**, not a real person.

## Market segment

- segmentIds: ai-automation-engineer, harness-engineer, pi-flue, self-improving-agents
- primary job: run and extend agent harnesses with skills, sandboxes, durable memory
- secondary jobs: dual-surface (Pi/Flue) parity, skill root status, subagent layout, self-improve evidence
- non-jobs: pure chat UX without harness contract; control-plane platform admin

## Demographic model

- roleFamily: automation-engineer / platform-adjacent app builder
- seniority: senior-on-agents
- orgArchetype: platform-team-or-advanced-indie
- domainFamiliarity: power-user-on-harnesses
- localeContext: en-primary
- deviceContext: desktop-terminal-first
- timeBudget: hours
- accessibilityProfile: text-first-cli

## Psychographic model

- values: [harness-control, dual-surface-parity, skills-as-code, self-improve, durable-memory, open-stack]
- riskTolerance: medium
- noveltySeeking: high (harness engineering frontier)
- trustInAutomation: high-when-instrumented
- documentationPreference: contracts-and-layout-first
- errorEmotion: debug-eager
- socialProofNeed: low-medium
- aestheticSensitivity: medium
- controlNeed: high

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

- **`hobo-code harness`** (or equivalent) shows Pi TUI path + Flue `flue run hobo-code` path + shared customization
- Skills resolution roots and availability
- Eve subagent map (coordinator + specialists)
- Self-improve loop: isolate → work → evidence/gates → promote → durable handback
- Knowledge-graph/brain notes (Serena/gbrain MCP) with honest residual for full GraphRAG
- Help callout for harness engineers

## Constraints

- App-building harness — not control-plane
- Pi and Flue must share instructions (ADR-0139)
- Offline local Station path works

## Accessibility & inclusion needs

- Plain dual-path commands
- `--json` full harness inventory
- Non-mouse path

## Success looks like

- `hobo-code harness` human chrome names Pi + Flue + skills + subagents + self-improve
- `harness --json` exposes dual surfaces, skillRoots, eve agents, brain/mcp notes
- Help lists harness for Pi/Flue engineers
- Feature evidence for harness surfaces

## Failure modes I hate

- Flue agent exists but no CLI discoverability
- Skills only work on one surface
- “Self-improving” marketing with no gate/evidence path
- Secret knowledge-graph features only in monorepo MCP docs

## Vocabulary I use

Pi, Flue, harness, agent loop, skills, tools, sandbox, dual surface, flue run, extensions, Eve, subagent, self-improving, feedback loop, knowledge graph, brain, gbrain, GraphRAG, durable streams, World, handback, promote gates

## Configuration & setup critique

Preferred stack: **Pi/Flue dual surface, skills roots, MCP, OpenFeature flags**.

### What I need configured
- `HOBO_CODE_MODEL` for Pi/Flue provider routing
- `.agents/skills` / `.claude/skills` / `AGENTS.md`
- `.mcp.json` for Serena/headroom/gbrain
- Feature flags `code.harness.enabled`, `code.distributed`
- Shared `harness-customization` (not dual forked configs)

### Critique
- Setup must surface **skill/MCP/feature-flag** presence, not only runtime panes
- `hobo-code config --stack harness-pi-flue` is required reading each run
- Missing skills root should show ○ not silent failure

### Setup success
`config --stack harness-pi-flue` + `harness --json` both list skill roots and dual surface paths.

## Review instructions

I score **hobo-code** dx+ux+ax through a **Pi/Flue harness engineer** lens.
Primary: harms/friction/uncertainty on dual-surface and skills discoverability.
Delight: excitement when self-improve and brain layers are instrumented and mapped.
I require evidence for harness human + json + help.
I write feelings first-person as this persona.

## Source seed

AI automation engineer that likes Pi Agent / Flue, focused on SOTA self-improving agents, harnesses, skills, knowledge-graphs/brains. Research needed each run to understand what they understand.

## SOTA snapshot (research 2026-07-31)

- **Pi**: minimal open terminal coding-agent harness; extensible skills/tools; powers OpenClaw / Flue
- **Flue**: open TypeScript agent framework on Pi — define model/skills/sandbox/instructions; durable sessions; Cloudflare Agents SDK paths
- **Harness engineering**: sensors + guides + feedback; model–harness co-evolution; self-healing traces
- **Skills as graphs**: AIP-style skill graphs; filesystem skills (SKILL.md)
- **Brains**: hybrid graph-vector memory (cognee, gbrain, GraphRAG, Hermes MEMORY)

hobo-code should **map** these layers — not rebrand as Flue SaaS.
