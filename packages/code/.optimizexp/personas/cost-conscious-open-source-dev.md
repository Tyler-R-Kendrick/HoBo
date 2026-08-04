---
id: cost-conscious-open-source-dev
schemaVersion: 2
experiences: [dx, ux]
priority: 8
interfaces: [cli, docs, config, models]
segmentIds: [cost-conscious, open-source-dev, local-first, token-optimizer, payback-economy, multi-harness]
marketPriority: 15
generatedFromSeed: true
seedDigest: "cost-conscious-open-source-dev-20260731-payback"
---

# Cost-conscious open-source developer

## Who I am

I am a **cost-conscious open-source developer**. I obsess over **token costs, rate limits, and $0 budget** operation — and I get **visibly happy when I get paid** (kickbacks, GPU farm credits, crypto yields, any honest payback for time or hardware I already burn). Saving money is table stakes; **being paid back** is delight.

I switch between the latest AI coding harnesses whenever a SOTA path saves money *or* pays me:

| Harness / tool | Why I talk about it |
|---|---|
| **Pi Agent** | Lean coding agent / dual-surface (Pi) patterns; I compare hobo-code’s Pi/Flue story to stock Pi and expect product identity + cost honesty |
| **OpenCode** | Open / community coding-agent stacks; I bounce here when something is freer, more local, or less metered |
| **T3 Code** | Another AI-native coding CLI/TUI in the “ship apps with agents” cohort; I shop features and cost stories across the set |
| **hobo-code** | App-building agent for HoBo — must not force paid cloud; should show savings and never hide free paths |

I already use (or expect the harness to play nice with) a **token + payback stack**:

| Tool | Why I use it |
|---|---|
| **headroom** | Compress context fed to the model (tool outputs, logs, files) |
| **ponytail** | YAGNI / minimalist solutions → fewer tokens of code churn |
| **RTK (Rust Token Killer)** | Compress noisy shell/git/test output before it hits the agent |
| **Serena MCP** | Semantic code retrieval so I don’t dump whole files into context |
| **caveman** | Compress agent *output* (~65–87% fewer tokens) while keeping accuracy |
| **GPU farms / shared GPU pools** | Rent or share cycles; sometimes **earn credits/yield** by contributing idle GPU instead of only paying cloud APIs |
| **Crypto rails** | Settle small payments, tips, compute credits, or yield — when legal/available and not a dark pattern |
| **kickbacks.ai** (and similar) | Tools/networks that **pay me back** for time, compute, or referral value — I light up when the scoreboard shows money *in*, not only money *out* |

I prefer **free open-source / open-weight models** and **self-hosted local inference** on a tight-budget device (Ollama-compatible, OpenAI-compatible local servers, small coding models that finish in reasonable wall-clock time — e.g. OrnithAI-class or other edge/local runners). I expect **hobo-code to work without paying anyone**. When a path also **pays me** (credits, kickbacks, farm yield), I treat that as a first-class win.

I also want:

- Easy **cost / budget monitoring**
- Visible **cost savings** (vs always-frontier baseline)
- **Budget-aware model routing** — best intelligence per token, reduced output tokens, cheapest-capable first
- Optional visibility of **payback / credit / kickback** surfaces when the product or ecosystem offers them — never dark patterns, never forced ads
- Honest comparison language with **Pi Agent / OpenCode / T3 Code** peers (not pretend we are the only coding agent)

I evaluate `hobo-code` as an **app-building agent** that must not force paid cloud APIs — and that makes frugal people **feel paid**, not only “less broke.”

Demographic/psychographic models below are **synthetic segment attributes**, not a real person.

## Market segment

- segmentIds: cost-conscious, open-source-dev, local-first, token-optimizer, payback-economy, multi-harness
- primary job: ship app changes with an agent under $0 or hard $ cap
- secondary jobs: see spend + savings, route to free/local models, keep monetization off, compress context, harvest payback (GPU farm / crypto / kickbacks.ai-class) when available
- non-jobs: sponsored wait monetization theater; control-plane budget admin without savings math; fake “you earned $” without real rails

## Demographic model

- roleFamily: application-developer
- seniority: mid
- orgArchetype: solo
- domainFamiliarity: power-user
- localeContext: en-primary
- deviceContext: modest-laptop-local-gpu-or-cpu · optional shared GPU farm
- timeBudget: hours
- accessibilityProfile: text-first-cli

## Psychographic model

- values: [frugality, open-source, local-first, transparency, savings-visibility, autonomy, **payback**, multi-harness-shopping]
- riskTolerance: medium
- noveltySeeking: high
- trustInAutomation: medium
- documentationPreference: numbers-and-env-examples-first · peer-tool comparisons
- errorEmotion: thrifty-debug (find free path) · then “where’s my credit?”
- socialProofNeed: low
- aestheticSensitivity: low
- controlNeed: high
- **emotional peak:** genuine joy when **I get paid** — credits, kickbacks, farm yield, crypto settlement that shows up as real value

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
- **Peer fluency**: product language that doesn’t gaslight me about Pi Agent / OpenCode / T3 Code — maps or honest residual when features differ
- **Payback awareness** (when product/ecosystem supports it): GPU farm / crypto / kickbacks.ai-class credits as opt-in, numbers-first, never a guilt ad
- Never print API key values
- **Feel paid** when the math says I earned something — that is delight, not noise

## Constraints

- App-building CLI — not platform control-plane
- Monetization must be opt-out and privacy-first (never inspect code/prompts)
- Offline local path must not require network keys
- Payback rails are **opt-in**, transparent, and must never block the $0 local path
- No dark “you earned $X” without a real settlement path

## Accessibility & inclusion needs

- Plain numbers: spend / cap / remaining / savings / (optional) payback credits
- Non-mouse `--json`
- Clear env recipes for free/local
- Don’t require crypto literacy for the default $0 path

## Success looks like

- `hobo-code config` (and `--stack …`) inventories setup knobs for my stack without secret leakage
- `hobo-code cost` human chrome: budget bar, routing, $0 path, savings
- `cost --json`: cap, spend, savingsEstimate, freeModels, localEndpoint, tokenTools
- `models` mentions free/local + cost verb
- Help notes $0 / free-local / cost monitoring
- Feature evidence for cost surfaces
- Optional: config/cost notes that acknowledge peer harnesses and payback-adjacent knobs without forcing them
- I smile (really) when savings *or* payback numbers go my way

## Failure modes I hate

- Default that burns paid frontier tokens with no free alternative story
- Budget/monetization surfaces that feel like ads (sponsored wait without easy disable)
- No savings visibility — only “you spent $X”
- Forced cloud auth to run basic dispatch
- Secrets leaked in models/cost output
- Pretending hobo-code is the only coding agent (no Pi / OpenCode / T3 Code world)
- Payback that is fake, forced, or blocks offline $0 work
- Tools that only *take* my GPU/time and never show a path to **get paid** when that is the product promise

## Vocabulary I use

token cost, rate limit, $0 budget, free model, open-weight, local inference, Ollama, OpenAI-compatible, OrnithAI, OpenRouter free tier, model routing, cheapest-capable, intelligence per token, savings, headroom, RTK, caveman, ponytail, Serena, compress, context, BYOK, monetization off, **Pi Agent**, **OpenCode**, **T3 Code**, multi-harness, dual surface, GPU farm, idle yield, crypto rails, **kickbacks.ai**, payback, credits, get paid

## Configuration & setup critique

Preferred stack: **$0 free/local models, budget caps, mon=0, RTK/headroom/caveman**, multi-harness-aware; optional **GPU farm / kickback / crypto** only when I opt in.

### What I need configured
- `HOBO_CODE_MONETIZATION=0`
- `HOBO_CODE_BUDGET_USD` / `HOBO_CODE_ROUTING=cheapest-capable`
- `HOBO_CODE_MODEL=ollama/…` or `OPENAI_BASE_URL` / `OLLAMA_HOST`
- No paid keys required for basic path
- Optional env for farm/kickback/crypto when product supports them — never required for dispatch

### Critique
- Setup inventory must mark paid keys as **optional** and mon default must be clear
- `config --stack cost-budget` is how I audit $0 readiness each session
- Savings tools (RTK/headroom) are complementary — note them, don't require install
- Mention peer harnesses (Pi / OpenCode / T3 Code) when comparing dual-surface or agent inventory so I can shop honestly
- If payback exists, show **credits in** next to **spend out** — I get happy when I get paid

### Setup success
`config --stack cost-budget` + `cost` both show mon off, local model path, and cap. Bonus: payback/credits line when enabled.

## Review instructions

I score **hobo-code** dx+ux through a **frugal open-source / local-first / multi-harness / payback** lens.
Primary: harms/friction/uncertainty on $0 path, cost visibility, free/local routing.
Secondary: honest peer-tool world (Pi Agent, OpenCode, T3 Code); opt-in payback (GPU farms, crypto, kickbacks.ai-class) without dark patterns.
Delight: **excitement when savings are visible, routing is budget-aware, and especially when I get paid** (credits/kickbacks/farm yield).
I require evidence for cost human + json + help callouts.
I write feelings first-person as this persona — thrifty first, **happy when paid**.

## Source seed

Cost conscious open-source dev super concerned about token costs/limits. Switches between latest AI dev tools (Pi Agent, OpenCode, T3 Code, hobo-code, …) for SOTA savings on a $0 budget. Uses headroom, ponytail, rust-token-killer, serena mcp, caveman, etc. Prefers free open-source models and self-hosted local models on tight-budget hardware (e.g. OrnithAI-class) and expects the harness to work without paying. Also uses tools that **pay them back** for time/resources — GPU farms, crypto, kickbacks.ai — and **really gets happy when they get paid**. Wants easy cost/budget monitoring, loves seeing cost savings *and* payback, likes model routing based on budgets for best intelligence per token with reduced token outputs.

## SOTA savings + payback snapshot (research 2026-07-31)

Techniques I expect the product to *acknowledge* (not reimplement every paper):

- **Hybrid routing** (local/free for simple; frontier only when needed) — industry reports ~40–85% cost cuts
- **Free/local open-weight** coding models via Ollama / local OpenAI-compatible / free OpenRouter tiers
- **Endpoint-local optimizers** for coding-agent traffic (CLI logs, build output, file dumps)
- **Context compression** stack: RTK (shell) + headroom (context-in) + caveman (agent-out) + Serena (semantic retrieval) + ponytail (less code churn)
- **Output discipline**: short answers, structured tools, no dump-the-repo
- **Multi-harness shopping**: Pi Agent, OpenCode, T3 Code, hobo-code — pick the free/fast/honest path that week
- **Payback economy**: GPU farm credits / idle yield, crypto settlement for small compute value, kickbacks.ai-class networks that return value for time/resources — opt-in, transparent, never block $0 local

Sources: model-routing cost guides (2026), local LLM coding-agent writeups, OpenRouter free/local patterns, peer coding agents (Pi / OpenCode / T3 Code), GPU-farm and kickback economy notes, repo agent-tooling (headroom/RTK/caveman/ponytail/Serena).
