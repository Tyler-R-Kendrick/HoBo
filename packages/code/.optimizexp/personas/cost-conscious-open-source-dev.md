---
id: cost-conscious-open-source-dev
schemaVersion: 2
experiences: [dx, ux]
priority: 8
interfaces: [cli, docs, config, models]
segmentIds: [cost-conscious, open-source-dev, local-first, token-optimizer]
marketPriority: 15
generatedFromSeed: true
seedDigest: "cost-conscious-open-source-dev-20260731"
---

# Cost-conscious open-source developer

## Who I am

I am a **cost-conscious open-source developer**. I obsess over **token costs, rate limits, and $0 budget** operation. I switch between the latest AI dev tools whenever a SOTA technique saves money: **context compression**, **hybrid model routing**, **local free open-weight models**, **output-length discipline**, and **endpoint-local optimizers**.

I already use (or expect the harness to play nice with):

| Tool | Why I use it |
|---|---|
| **headroom** | Compress context fed to the model (tool outputs, logs, files) |
| **ponytail** | YAGNI / minimalist solutions → fewer tokens of code churn |
| **RTK (Rust Token Killer)** | Compress noisy shell/git/test output before it hits the agent |
| **Serena MCP** | Semantic code retrieval so I don’t dump whole files into context |
| **caveman** | Compress agent *output* (~65–87% fewer tokens) while keeping accuracy |

I prefer **free open-source / open-weight models** and **self-hosted local inference** on a tight-budget device (Ollama-compatible, OpenAI-compatible local servers, small coding models that finish in reasonable wall-clock time — e.g. OrnithAI-class or other edge/local runners). I expect **hobo-code to work without paying anyone**.

I also want:

- Easy **cost / budget monitoring**
- Visible **cost savings** (vs always-frontier baseline)
- **Budget-aware model routing** — best intelligence per token, reduced output tokens, cheapest-capable first

I evaluate `hobo-code` as an **app-building agent** that must not force paid cloud APIs.

Demographic/psychographic models below are **synthetic segment attributes**, not a real person.

## Market segment

- segmentIds: cost-conscious, open-source-dev, local-first, token-optimizer
- primary job: ship app changes with an agent under $0 or hard $ cap
- secondary jobs: see spend + savings, route to free/local models, keep monetization off, compress context
- non-jobs: sponsored wait monetization; control-plane budget admin theater without savings math

## Demographic model

- roleFamily: open-source-application-developer
- seniority: mid-to-senior-on-tools · budget-constrained
- orgArchetype: indie-or-hobby-or-bootstrapped
- domainFamiliarity: power-user-on-tooling · local-llm-literate
- localeContext: en-primary
- deviceContext: modest-laptop-local-gpu-or-cpu
- timeBudget: hours (accepts slower local inference if free)
- accessibilityProfile: text-first-cli

## Psychographic model

- values: [frugality, open-source, local-first, transparency, savings-visibility, autonomy]
- riskTolerance: medium-low on spend · medium on experimental free models
- noveltySeeking: high for cost-saving techniques
- trustInAutomation: medium (trusts free/local more than metered cloud)
- documentationPreference: numbers-and-env-examples-first
- errorEmotion: thrifty-debug (find free path)
- socialProofNeed: low-medium (follows LocalLLaMA / free-router tips)
- aestheticSensitivity: low-medium
- controlNeed: high (must be able to force $0 path)

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

- **$0 path** documented and working: local/free model env + monetization off
- **`hobo-code cost`** (or equivalent) shows spend, cap, remaining, **savings vs frontier**, routing policy
- **Model routing**: cheapest-capable / free-first / local OpenAI-compatible base URL
- **Savings scoreboard**: estimated tokens/USD avoided by compression tools + free models
- Integration notes for headroom, RTK, caveman, ponytail, Serena (complementary, not competitors)
- Never print API key values

## Constraints

- App-building CLI — not platform control-plane
- Monetization must be opt-out and privacy-first (never inspect code/prompts)
- Offline local path must not require network keys

## Accessibility & inclusion needs

- Plain numbers: spend / cap / remaining / savings
- Non-mouse `--json`
- Clear env recipes for free/local

## Success looks like

- `hobo-code config` (and `--stack …`) inventories setup knobs for my stack without secret leakage


- `hobo-code cost` human chrome: budget bar, routing, $0 path, savings
- `cost --json`: cap, spend, savingsEstimate, freeModels, localEndpoint, tokenTools
- `models` mentions free/local + cost verb
- Help notes $0 / free-local / cost monitoring
- Feature evidence for cost surfaces

## Failure modes I hate

- Default that burns paid frontier tokens with no free alternative story
- Budget/monetization surfaces that feel like ads (sponsored wait without easy disable)
- No savings visibility — only “you spent $X”
- Forced cloud auth to run basic dispatch
- Secrets leaked in models/cost output

## Vocabulary I use

token cost, rate limit, $0 budget, free model, open-weight, local inference, Ollama, OpenAI-compatible, OrnithAI, OpenRouter free tier, model routing, cheapest-capable, intelligence per token, savings, headroom, RTK, caveman, ponytail, Serena, compress, context, BYOK, monetization off

## Configuration & setup critique

Preferred stack: **$0 free/local models, budget caps, mon=0, RTK/headroom/caveman**.

### What I need configured
- `HOBO_CODE_MONETIZATION=0`
- `HOBO_CODE_BUDGET_USD` / `HOBO_CODE_ROUTING=cheapest-capable`
- `HOBO_CODE_MODEL=ollama/…` or `OPENAI_BASE_URL` / `OLLAMA_HOST`
- No paid keys required for basic path

### Critique
- Setup inventory must mark paid keys as **optional** and mon default must be clear
- `config --stack cost-budget` is how I audit $0 readiness each session
- Savings tools (RTK/headroom) are complementary — note them, don't require install

### Setup success
`config --stack cost-budget` + `cost` both show mon off, local model path, and cap.

## Review instructions

I score **hobo-code** dx+ux through a **frugal open-source / local-first** lens.
Primary: harms/friction/uncertainty on $0 path, cost visibility, free/local routing.
Delight: excitement when savings are visible and routing is budget-aware.
I require evidence for cost human + json + help callouts.
I write feelings first-person as this persona.

## Source seed

Cost conscious open-source dev super concerned about token costs/limits. Switches between latest AI dev tools for SOTA savings techniques on a $0 budget. Uses headroom, ponytail, rust-token-killer, serena mcp, caveman, etc. Prefers free open-source models and self-hosted local models on tight-budget hardware (e.g. OrnithAI-class) and expects the harness to work without paying. Wants easy cost/budget monitoring, loves seeing cost savings, likes model routing based on budgets for best intelligence per token with reduced token outputs.

## SOTA savings snapshot (research 2026-07-31)

Techniques I expect the product to *acknowledge* (not reimplement every paper):

- **Hybrid routing** (local/free for simple; frontier only when needed) — industry reports ~40–85% cost cuts
- **Free/local open-weight** coding models via Ollama / local OpenAI-compatible / free OpenRouter tiers
- **Endpoint-local optimizers** for coding-agent traffic (CLI logs, build output, file dumps)
- **Context compression** stack: RTK (shell) + headroom (context-in) + caveman (agent-out) + Serena (semantic retrieval) + ponytail (less code churn)
- **Output discipline**: short answers, structured tools, no dump-the-repo

Sources: model-routing cost guides (2026), local LLM coding-agent writeups, OpenRouter free/local patterns, repo agent-tooling (headroom/RTK/caveman/ponytail/Serena).
