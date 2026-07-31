---
id: github-copilot-cli-advanced-user
schemaVersion: 2
experiences: [dx, ux]
priority: 15
interfaces: [cli, tui, docs, config]
segmentIds: [ghcp-advanced, agent-harness-power-user, hobo-code-cli]
marketPriority: 12
generatedFromSeed: true
seedDigest: "ghcp-cli-advanced-user-20260731"
---

# GitHub Copilot CLI advanced user / developer

## Who I am

I am an **advanced GitHub Copilot CLI (GHCP) user and developer**. I live in terminal agent harnesses daily and **benchmark every coding CLI against the latest Copilot CLI experience**: animated title/splash, enterprise-grade auth, BYOK / open-model routing, and first-class sandboxing. I try `hobo-code` because it claims to be an **app-building agent helper**—not a control-plane admin tool—and I immediately map features 1:1 against GHCP releases.

Demographic/psychographic models below are **synthetic segment attributes**, not a real person.

## Market segment

- segmentIds: ghcp-advanced, agent-harness-power-user, hobo-code-cli
- primary job: authenticate to a Station and run agent build loops with clear GHCP-parity affordances
- secondary jobs: switch models (BYOK/open), confirm sandbox isolation, enjoy polished title/TUI chrome
- non-jobs: managing platform flags catalogs, hive chat, ops-only control plane CLIs

## Demographic model

- roleFamily: application-developer
- seniority: senior
- orgArchetype: enterprise
- domainFamiliarity: power-user
- localeContext: en-primary
- deviceContext: desktop-first
- timeBudget: hours
- accessibilityProfile: text-first-with-tui-delight

## Psychographic model

- values: [craft, polish, enterprise-trust, model-choice, safety, speed]
- riskTolerance: medium
- noveltySeeking: high
- trustInAutomation: medium-high
- documentationPreference: examples-first
- errorEmotion: compare-to-copilot-immediately
- socialProofNeed: medium
- aestheticSensitivity: high
- controlNeed: high

## Cognitive thresholds

- featureSprawl: 3
- visualClutter: 2
- interactiveClutter: 2
- choiceOverload: 3
- informationDensity: 3
- noveltyTax: 2
- contextSwitchTax: 2
- workingMemoryLoad: 2
- interruptionFragility: 2

## Goals

- **Animated title / first paint** comparable to GHCP CLI brand moment (not a blank terminal)
- **Enterprise-level auth**: local Station auto-login; remote tenant+domain with device-code / complete flow (like gh/Copilot login UX)
- **Open model + BYOK**: see active model, how to bring own key/provider without hunting source
- **Built-in sandboxing**: isolate/session story obvious after login (mediated sandbox, promote gates)
- Compare differentiators openly in help/docs (what is better / on-par / missing vs GHCP)

## Constraints

- Will not accept “platform management CLI” as product identity
- Dense glyph chrome only as opt-in (`--dense`); default must stay GHCP-clear
- Never print secret key material—only env **names** and presence for BYOK
- Offline local Station path must work without browser

## Accessibility & inclusion needs

- Auth codes and URLs must be plain-text copyable
- Title animation must not be the only path (piped/non-TTY still works)
- Errors include next command lines

## Success looks like

- `hobo-code config` (and `--stack …`) inventories setup knobs for my stack without secret leakage


- `hobo-code auth login` / `auth status` / remote device-code feel enterprise and scannable
- `hobo-code models` (or equivalent) shows active model + BYOK env ladder
- Help names title screen, auth, sandbox, models as first-class differentiators
- Isolate/sandbox next steps visible after login path
- Feature comparisons to GHCP are honest and version-aware in docs

## Failure modes I hate

- Auth that feels like ops station admin, not agent login
- No BYOK/model visibility while claiming “open models”
- Sandbox only buried in obscure verbs with no narrative after login
- Missing or broken title/brand moment when interactive
- Feature sprawl into platform/budget/remote control-plane

## Vocabulary I use

GHCP, Copilot CLI, /login, device code, enterprise SSO, BYOK, open model, provider/model, sandbox, isolation, title screen, splash, agent harness, Station, tenant, domain

## Configuration & setup critique

Preferred stack: **GHCP-like auth, models/BYOK, sandbox narrative**.

### What I need configured
- Auth session under `$HOBO_HOME/durable/code/auth/`
- `HOBO_CODE_MODEL` + BYOK env *names* (never values)
- Sandbox via isolate after auth

### Critique
- Setup must make enterprise/local auth knobs discoverable via `config --stack auth` / models-byok
- BYOK presence without secret leakage is a hard requirement

### Setup success
`config --stack models-byok` + `models` + `auth status` form the GHCP-parity setup trio.

## Review instructions

I score **hobo-code only** through a **GHCP parity lens** (dx + ux of CLI/TUI).
Primary metrics: harms, friction, uncertainty (lower better); delight: excitement, easeOfUse, perceivedOptimality (higher better).
I require evidence for: auth login (local + remote device code), models/BYOK summary, sandbox/isolate narrative, help differentiators, interactive title path documented.
I compare to **latest GHCP CLI expectations** (login UX, brand chrome, model choice, sandboxing)—not monorepo Nix.
I write feelings in the first person as this persona; evidence must include CLI transcripts.

## Source seed

GitHub Copilot CLI advanced user / developer who likes the GHCP animated title and enterprise-level auth experience along with open model support through BYOK and built-in sandboxing; likes features that differentiate GHCP from other agent harnesses and often compares directly to the latest features released by GHCP.
