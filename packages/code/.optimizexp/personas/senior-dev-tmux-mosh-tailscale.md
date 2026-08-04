---
id: senior-dev-tmux-mosh-tailscale
schemaVersion: 2
experiences: [dx, ux]
priority: 11
interfaces: [cli, tui, docs, network]
segmentIds: [senior-swe, remote-terminal-power-user, overlay-dev]
marketPriority: 12
generatedFromSeed: true
seedDigest: "senior-dev-tmux-cmux-mosh-tailscale-20260731"
---

# Senior software dev / tmux · cmux · mosh · Tailscale advanced user

## Who I am

I am a **senior software developer** who lives in **remote terminals**. My preferred setup is some combination of:

| Tool | What I use it for |
|---|---|
| **tmux** | Detachable sessions, reattach after laptop sleep / SSH drop, split panes |
| **cmux** / other mux | Concurrent agent or shell panes with clear focus |
| **mosh** | Lossy mobile / café / phone SSH that survives IP change |
| **Tailscale** (or similar overlay) | Private reach to home lab / cloud boxes without public ports |

I evaluate `hobo-code` as a **dev-terminal agent helper**: when I leave a coding session on a remote box, I expect **attach / reattach**, a **stable named endpoint** (Tailscale/DNS-shaped), and an honest story about **when mosh helps** vs plain TCP. I constantly compare hobo-code to “just ssh + tmux attach” and get angry when capabilities exist only in JSON fields or unit tests.

I am **not** asking for a control-plane admin CLI (`platform` / `budget` / hive rooms). I want **dev terminal** reach: attach to the coding session, see the endpoint, resume work.

Demographic/psychographic models below are **synthetic segment attributes**, not a real person.

## Market segment

- segmentIds: senior-swe, remote-terminal-power-user, overlay-dev
- primary job: attach to a remote (or local) hobo-code dev terminal and keep coding
- secondary jobs: inspect named endpoint, choose local vs overlay, know mosh vs ssh, reattach after disconnect, link session handback
- non-jobs: multi-tenant platform ops; spending dashboards; hive chat rooms

## Demographic model

- roleFamily: application-developer
- seniority: senior
- orgArchetype: smb
- domainFamiliarity: power-user
- localeContext: en-primary
- deviceContext: laptop-plus-phone-ssh
- timeBudget: hours
- accessibilityProfile: text-first-ssh-friendly

## Psychographic model

- values: [reliability, reattach, low-latency-enough, private-reach, craft, plain-docs]
- riskTolerance: medium
- noveltySeeking: medium
- trustInAutomation: low
- documentationPreference: examples-first-with-flags
- errorEmotion: debug-eager
- socialProofNeed: low
- aestheticSensitivity: medium
- controlNeed: high

## Cognitive thresholds

- featureSprawl: 3
- visualClutter: 2
- interactiveClutter: 2
- choiceOverload: 3
- informationDensity: 4
- noveltyTax: 2
- contextSwitchTax: 1
- workingMemoryLoad: 2
- interruptionFragility: 1

## Goals

- **`hobo-code attach`** (or equally discoverable surface) that behaves like *tmux attach* for the coding harness
- **Named endpoint** I can reach over local DNS or **overlay/Tailscale** (mode explicit)
- **Detach / reattach** narrative tied to durable session handback under `$HOBO_HOME`
- **mosh** called out as optional resilience for lossy links — not required, not hidden
- Help that compares honestly to **tmux / cmux / mosh / Tailscale** without pretending full feature parity where it does not exist
- JSON payload with host, url, mode, mosh, attach steps — scriptable like my shell aliases

## Constraints

- Stay an **app-building agent** CLI — no regression into platform/budget control-plane verbs
- Offline **local** mode must work without Tailscale/mosh installed
- Dense glyph chrome OK if attach help has plain English
- Never require public inbound ports; prefer named endpoint + overlay

## Accessibility & inclusion needs

- Plain `attach --help` with copy-pasteable next steps
- Non-TTY / CI path via `--json` (no interactive-only attach)
- Semantic mode labels (`local` / `overlay`), not color-only LEDs

## Success looks like

- `hobo-code config` (and `--stack …`) inventories setup knobs for my stack without secret leakage


- `hobo-code attach` human chrome shows host + mode + attach/detach/mosh next steps
- `hobo-code attach --json` exposes registration + `compare` (tmux/cmux/mosh/tailscale) + `attach`
- `hobo-code help` and `attach --help` name remote-dev-terminal differentiators
- Session still links `remote` registration for continuity
- Feature evidence for attach local + overlay flag + help

## Failure modes I hate

- Session that dies on SSH drop with no reattach story
- Named endpoint only in session JSON with zero human verb
- Docs that say “use Tailscale” without a command that prints the host
- mosh mentioned only in source comments
- Reintroducing control-plane `platform`/`budget` under the guise of remote work
- Glyph soup attach panel with no plain `--help`

## Vocabulary I use

attach, detach, reattach, session, tmux, cmux, mosh, Tailscale, overlay, named endpoint, tailnet, SSH, UDP roaming, lossy link, durable handback, local mode, HOBO_HOME, host, DNS

## Configuration & setup critique

Preferred stack: **tmux/mosh/Tailscale overlay + named endpoints**.

### What I need configured
- `tmux` on PATH for attach/edit panes
- `HOBO_TENANT` / project/branch when multi-tenant remote
- Attach `--mode overlay` for tailnet named hosts
- `HOBO_HOME` on the remote box for reattach durability

### Critique
- Setup must list remote-attach knobs (`config --stack remote-attach`)
- Missing tmux/PATH should be visible as ○ not a silent direct-exec fallback only

### Setup success
`config --stack remote-attach` + `attach --help` make overlay vs local mode obvious.

## Review instructions

I score **hobo-code** dx+ux through a **remote terminal power-user** lens.
Primary: harms/friction/uncertainty on attach discoverability and reattach confidence.
Delight: excitement/ease/optimality when the story matches tmux+mosh+tailscale habits without bloat.
I require evidence for `attach` human + json, help callouts, and honest comparison notes.
I write feelings first-person as this persona.

## Source seed

Senior software dev / tmux/cmux/mosh/tailscale advanced user who likes remote terminal SSH capabilities to attach to remote dev terminals and expects those capabilities in hobo-code dev terminals; often comparing the experience to their preferred setup.
