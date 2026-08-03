# `@hobo/code` · binary **`hobo-code`**

**App-building agent / helper** for HoBo — not a control-plane management CLI.

CLI name is **`hobo-code`** (dash is fine). There is **no** `hobo code` nested verb.

### Build vs install (read this)

The installed binary is **compiled** (`dist/`). Source lives in `src/`.

| Do this | Not this |
|---|---|
| `pnpm --filter @hobo/code build` then `hobo-code …` | Only edit `src/` and assume `~/.local/bin/hobo-code` updated |
| Link bin: `pnpm --filter @hobo/code link --global` (uses `bin/hobo-code.mjs`) | Symlink straight at `dist/bin/hobo-code.js` and forget rebuilds |
| Evidence / optimizexp: exercise the **installed** `hobo-code` after build | Capture only via `node --import tsx src/bin/…` (can pass while dist is stale) |

`bin/hobo-code.mjs` **auto-rebuilds** when `src/` is newer than `dist/` (skip with `HOBO_CODE_SKIP_STALE_REBUILD=1`).

| Binary | Product |
|---|---|
| **`hobo-code`** | App-building coding agent (this package) |
| **`hobo`** | Control-plane shell (`up` / `dev` / `plan` / …) — **not** the coding harness |

### Interactive TTY (bare `hobo-code`)

On a real TTY, bare `hobo-code` opens the **HoBo InteractiveShell** (product chrome):

| In the shell | What it is |
|---|---|
| Header | HoBo logo + animated **Bo** mascot (differential render — no flicker; reduced motion honored) |
| Chat | Transcript · type a build prompt · Enter · `↑/↓` + `PgUp/PgDn` scroll |
| `/` slash | `guide` `config` `cost` `tasks` `status` `agent` `env` `auth` `about` … (`↑/↓` pick) |
| Tab | Cycle **Chat → Tasks → Status** |
| Footer | engine · budget · hermetic env cue |

Rendering rides pi-tui's differential renderer as a library — HoBo owns the
chrome (see `ARCHITECTURE.md` for the render-economy contract).

**The agent loop is real when credentials exist** (any BYOK env, a pi
`auth.json`, or `HOBO_CODE_ENGINE=pi`): prompts stream a live pi engine turn
(text deltas + `tool · <name>` lines; **Esc cancels**) running inside a
mediated isolation sandbox — the canonical tree stays read-only and edits
apply only through the audited gate `hobo-code promote --run <id>`. The
sandbox is kept on exit so un-promoted work survives. The footer names the
model that actually runs. `HOBO_CODE_ENGINE=none` opts out.

Without credentials the shell stays honest instead of pretending: prompts
queue dispatch compute tasks, the footer reads `engine:none ·
dispatch-only`, and every reply names the recorded task plus the one-shot
command equivalent. Product identity lives in `/about` (not stock Pi Agent
UI; escape hatch only: `HOBO_CODE_TUI=pi` or `hobo-code --pi`).

When stdin is not a TTY, an empty invocation fails closed with
`HOBO_CODE_INTERACTIVE_REQUIRED` and prints `hobo-code help` plus the prompt
form to use. `--json` includes `interactiveRequired: true` and `remediation[]`.
It never attempts a default dispatch or durable-state write.

Fail-closed exit codes are stable: `HOBO_CODE_INTERACTIVE_REQUIRED` means the
caller supplied no prompt without a TTY; use `hobo-code help` or provide a
prompt. Machine callers should branch on `code` and consume `remediation[]`.

| Shell slash | One-shot CLI |
|---|---|
| `/agent` `/config` `/cost` `/harness` | `hobo-code agent` · `config` · `cost` · `harness` |
| `/status` `/guide` `/tasks` `/login` | `hobo-code status` · `guide` · `tasks` · `auth login --agent` |
| `/help` | keys + map · outside: `hobo-code help` |

## Quick start (Copilot-CLI-like)

```bash
# 0) Optional map if you know Claude Code more than git
hobo-code guide

# 1) Login to a Station
hobo-code auth login
# Local Station is auto-resolved (station:local / only local station; auto-init).

# Remote Station (tenant + domain required)
hobo-code auth login --tenant acme --domain stations.acme.example
# → one-time device code + verification URL
hobo-code auth login --complete ABCD-EF

hobo-code auth status
hobo-code auth whoami
hobo-code auth logout

# Models / BYOK (open models — secret values never printed)
hobo-code models
export HOBO_CODE_MODEL=openai/gpt-4.1
# export OPENAI_API_KEY=…  # BYOK; hobo-code models only shows the env *name*

# Interactive brand moment (GHCP-style): bare TTY
# hobo-code

# 2) Build
hobo-code "add a settings page to the bindle"
hobo-code scaffold --name demo
hobo-code status                 # plain English session hierarchy (default)
hobo-code status --dense         # power-user glyph box + Herdr/Grok footers
hobo-code tasks                  # background task board
hobo-code session
hobo-code attach                 # tmux-like reattach + named endpoint
hobo-code attach --mode overlay  # Tailscale/overlay host
hobo-code isolate my-run
hobo-code promote my-run
```

## Usage

```bash
hobo-code "refine the openui bindle"   # default = dispatch
hobo-code dispatch "…"
hobo-code auth login
hobo-code auth status
hobo-code status                       # plain hierarchy; --dense for glyph box
hobo-code session --json
hobo-code scaffold --name demo
hobo-code isolate --json
hobo-code promote --run <id>
hobo-code env --json
hobo-code help                         # grouped Start here / Session / Craft / Agent
hobo-code auth --help                  # verb-scoped help
hobo-code help --dense                 # power-user glyph strip (opt-in)
# Unknown CLI-shaped tokens fail kindly (not a fake success star):
#   hobo-code not-a-verb → ? cmd · try help · or quote as prompt
```

## Verbs (app-building)

| Verb | Role |
|---|---|
| **dispatch** (default) | App-building agent dispatch |
| **auth** | Station login / status / logout (local auto, remote tenant+domain) |
| **models** | Active model + BYOK env presence (open models; no secret values) |
| status | Session / agent multiplexer chrome |
| session | Isolation session + handback |
| **attach** | Dev-terminal attach (tmux reattach · mosh? · Tailscale overlay named endpoint) |
| **tasks** | Background task board (Grok Build–shaped: click · tasks · workflows) |
| **guide** | Claude Code → hobo-code map (plain English for non-dev app builders) |
| **cost** | Budget, $0 free/local path, savings scoreboard, cheapest-capable routing |
| **harness** | Pi/Flue dual surface, skills, Eve subagents, self-improve, brain notes |
| **edit** | Open [neo]vim in managed harness pane (tmux/stdio bridge + hobo-code.nvim) |
| **config** | Env/flags inventory by stack (setup critique; secrets presence-only) |
| **agent** | Agent-native readiness: human-free auth, MCP/ACP, unattended/no-elicitation |
| scaffold | OpenUI/Astryx scaffold template |
| isolate / promote | Built-in mediated sandbox + gated promote |
| env | Optional hermetic shell + durable layout |
| help | Plain help (or `--dense` glyph idioms) |

**GHCP-adjacent differentiators:** animated title on bare TTY, enterprise-style Station auth, BYOK/open models via `models`, mediated sandbox (`isolate`/`session`).

**Herdr multiplexer differentiators** (vs single-stream agent CLIs):

| Capability | Where |
|---|---|
| Multi-pane agent mux + semantic state glyphs | `hobo-code status` / `session` |
| Detachable session model | `session` + durable handback |
| Highlight-to-copy | status footer `highlight→copy`; JSON `copyOnHighlight` / pane `highlightBuffer` |
| Session persistence | `$HOBO_HOME` durable root + `session-end.json` (`session --json` → `persistence`) |
| Capability legend | status human footer · `status --help` · `session --help` |

Dense pane chrome stays quiet; discoverability lives in the status footer, verb help, and `--json` (`herdr` / `capabilities`).

**Remote dev terminal (tmux · mosh · Tailscale mental model):**

| Preferred tool | hobo-code analogue |
|---|---|
| tmux attach | `hobo-code attach` + durable session under `$HOBO_HOME` |
| cmux / multi-pane | `status` / `session` Herdr panes |
| mosh | optional; `attach --json` → `registration.mosh` when lossy |
| Tailscale | `attach --mode overlay` named endpoint (ADR-0130) |

`attach` is a **dev-terminal** surface, not a control-plane admin verb. Local mode works offline without Tailscale.

**Grok Build–shaped TUI (AI-native expectations):**

| Grok Build | hobo-code |
|---|---|
| Fullscreen mouse TUI / click targets | `status`/`tasks` JSON `clickableRegions` + task-row story |
| Tasks pane / still-running | `hobo-code tasks` board + working panes |
| Workflows + multi-agent progress | Local World + `planDurableWorkflowRun` on `tasks --json` |
| Headless `-p` | `--json` envelopes |
| Subagents | Multi-pane status/session + Eve surface |

Honest parity language only — hobo-code is HoBo app-building, not a Grok Build reimplementation.

**Coming from Claude Code (app builder, not a traditional developer)?**

```bash
hobo-code guide          # plain-English feature map
hobo-code guide --json   # structured map + residual gaps
```

Maps workflows, remote connect, channels, routines, reviews, Chrome browser, deep-research, fork, btw → hobo-code verbs with honest **supported / partial / residual** status.

**Coming from Cursor (Agent / Composer / Background Agent / BugBot)?**

```bash
hobo-code guide --cursor
hobo-code guide --cursor --json
```

Maps Agent mode, Composer, Background Agent, BugBot, MCP, Rules, Hooks, multi-model, headless CLI → isolate/promote/tasks/models with honest residual (Tab UI, BugBot SaaS, Slack Automations).

**Cost-conscious / $0 open-source path:**

```bash
export HOBO_CODE_MONETIZATION=0
export HOBO_CODE_MODEL=ollama/qwen2.5-coder:7b   # or OPENAI_BASE_URL=http://127.0.0.1:…
export HOBO_CODE_BUDGET_USD=0                    # hard cap
export HOBO_CODE_ROUTING=cheapest-capable
hobo-code cost                                   # spend · savings · free/local recipes
hobo-code models                                 # active model + free-local hints
```

Stack that multiplies savings (repo agent tooling): **RTK** (shell noise) · **headroom** (context-in) · **caveman** (agent-out) · **Serena** (semantic retrieval) · **ponytail** (less churn).

**Pi / Flue harness engineers (self-improving agents, skills, brains):**

```bash
hobo-code harness              # dual surface inventory
hobo-code harness --json       # skills · Eve · self-improve · brain
# Interactive Pi path shares instructions with:
#   flue run hobo-code --input '{"message":"…"}'
```

**CLI-native / vim·neovim (managed pane):**

```bash
hobo-code edit src/cli.ts                    # prefer nvim; tmux split when available
hobo-code edit --bridge tmux-send --print-cmd path | sh
hobo-code edit --json path                   # bridge contract for plugins
# Neovim extension: packages/code/editor/hobo-code.nvim
#   :HoboOpen  :HoboStatus  :HoboIsolation
```

**Setup / configuration inventory (persona stacks):**

```bash
hobo-code config                         # multi-stack ●/○ inventory + setup tips
hobo-code config --stack cost-budget     # mon=0, budget, free-local models
hobo-code config --stack editor-vim      # $EDITOR, nvim/tmux, hobo-code.nvim
hobo-code config --stack hermetic-nix    # optional devenv/flake markers
hobo-code config --stack harness-pi-flue # MCP, AGENTS.md, skills
hobo-code config --stack agent-native    # agent auth + no-elicitation knobs
hobo-code config --json                  # full knobs (API keys = presence only)
```

**Protocol-native coding agents (unattended / MCP / ACP):**

```bash
export HOBO_CODE_AGENT=1
hobo-code auth login --agent             # human-free local Station (no device-code)
hobo-code agent --json                   # MCP tools · ACP status · unattended contract
hobo-code isolate --json                 # safe iterate
# hobo-code promote --run <id> --json    # gated merge
```

Keyboard-first navigation stays CLI: `status` · `tasks` · `isolate` · `edit` · `config` · `agent` · `promote` · `attach`.

Control-plane style verbs (`platform`, hive join/rooms) are **not** part of this surface. Token **cost** is app-building FinOps visibility, not platform budget admin.

## Auth model

| Mode | How |
|---|---|
| **Local** | `hobo-code auth login` — finds/init `station:local` (or sole local Station). No browser. |
| **Remote** | `--tenant` + `--domain` — device-code flow (copy code, open URL, `--complete <code>`). |

Session stored under `$HOBO_HOME/durable/code/auth/session.json`. Later `session` / `dispatch` prefer the logged-in Station.

## Hermetic / durable (optional Nix · devenv)

Optional hermetic shells for the coding agent only — never monorepo-wide Nix IaC. See `hobo-code env --help`.

## Multi-node compute (internal)

Dispatch may use capacity-aware multi-node scheduling under the hood (`code.distributed`). That is **worker scheduling**, not a buzz/hive chat product and not exposed as management verbs.

## Progressive flags (all **ON** by default)

| Flag | Role |
|---|---|
| `code.harness.enabled` | Master switch |
| `code.evidence.visual` | Evidence triple |
| `code.monetization.surface` | Privacy-first sponsored wait |
| `code.isolation.rift` | Prefer CoW rift when available |
| `code.distributed` | Multi-node compute dispatch |

## Package layout

`src/`, `test/`, `contracts/`, `data-models/` — konsistent production package.
