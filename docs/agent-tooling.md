# Agent tooling

Seven third-party AI-coding tools are wired into this repo for **Claude Code**, **Cursor**, and **Codex** (Superpowers also targets **GitHub Copilot CLI**). This page is the reference; the at-a-glance table + always-on caveman directive live in [`../AGENTS.md`](../AGENTS.md). Install the binaries with [`../scripts/setup-agent-tools.sh`](../scripts/setup-agent-tools.sh).

> **Note:** this is *tooling* config, not part of the HoBo product design (`docs/design/`). It was added on request to make the agents productive in this repo.

## The seven tools

### improve — `shadcn/improve` (MIT)
A **read-only agent skill**: surveys the codebase and writes prioritized, self-contained implementation **plans** to `plans/` for other (cheaper) agents to execute. It never edits source. Commands: `/improve`, `/improve quick`, `/improve deep`, `/improve security|perf|tests|bugs`, `/improve branch`, `/improve next`, `/improve plan <desc>`, `/improve execute <plan>`, `/improve reconcile`. No API keys. Installed to `.claude/skills/improve` (Claude Code) and `.agents/skills/improve` (Cursor + Codex).

### superpowers — `obra/Superpowers` (MIT)
A **plugin** (skills library + methodology), v6.0.3, from the `obra/superpowers-marketplace`. Adds a structured development workflow — **brainstorming** (design refinement via questions), **writing-plans**, **test-driven-development**, **systematic-debugging**, **subagent-driven-development**, **requesting/receiving-code-review**, **using-git-worktrees**, **verification-before-completion**, **dispatching-parallel-agents**, **finishing-a-development-branch**, `using-superpowers`, `writing-skills` (14 skills total). **No API keys** (optional `SUPERPOWERS_DISABLE_TELEMETRY=1`). A `SessionStart` hook loads the skills, so **enable, then start a fresh session**.
- **Install (per agent):** Claude Code is wired repo-portably via [`../.claude/settings.json`](../.claude/settings.json) (`extraKnownMarketplaces` + `enabledPlugins`) — opening the repo auto-enables it. Codex / Copilot install per-machine: `<agent> plugin marketplace add obra/superpowers-marketplace && <agent> plugin install superpowers@superpowers-marketplace` (the setup script runs these when those CLIs are present). Unlike the skills tools, this is a **global plugin**, not committed skill files.

### mattpocock/skills — `mattpocock/skills` (MIT)
A **skills collection** of engineering disciplines, installed via the `skills` CLI to `.claude/skills/` (Claude Code) and `.agents/skills/` (Cursor + Codex). Highlights: **`grill-with-docs`** ("a relentless interview to sharpen a plan or design, which also creates docs — ADRs and glossary — as we go"), `domain-modeling`, `codebase-design`, `design-an-interface`, `diagnosing-bugs`, `tdd`, `to-prd`, `to-issues`, `request-refactor-plan`, `prototype`, plus model-invoked `grilling`. **No API keys.**
- **Configure (one-time):** run `/setup-matt-pocock-skills` in your agent to set up its issue-tracker / triage-label vocabulary / domain-doc layout (optional for a docs repo; skip if you don't use the issue-tracking skills).
- Used in this repo to **close competitor gaps** — see [`competitors/gap-analysis.md`](../competitors/gap-analysis.md) and the resulting design work.

### caveman — `JuliusBrussee/caveman` (MIT)
A **skill + always-on rule** that compresses the agent's **output** (~65–87% fewer tokens) while preserving technical accuracy. Commands: `/caveman [lite|full|ultra|wenyan]`, `/caveman-commit`, `/caveman-review`, `/caveman-compress <file>`, `/caveman-stats`. No API keys. Installed to `.agents/skills/caveman*` (+ `cavecrew`), `.cursor/rules/caveman.mdc` (`alwaysApply: true`), a `## Caveman mode (active)` block in `AGENTS.md`, and (for Claude Code) a global `claude` plugin. Optional env `CAVEMAN_STATUSLINE_SAVINGS=0`.
- **It is ON by default.** To disable: delete `.cursor/rules/caveman.mdc`, remove the `<!-- caveman:begin … end -->` block from `AGENTS.md`, and run `npx -y github:JuliusBrussee/caveman -- --uninstall`.

### ponytail — `DietrichGebert/ponytail` (MIT)
A **minimalist-coding skill**: channels a senior dev who pushes the laziest solution that works — YAGNI (does this need to exist?), standard library before custom code, native platform features before dependencies, one line before fifty. Commands: `/ponytail [lite|full|ultra]`, `/ponytail-review` (review a diff for over-engineering), `/ponytail-audit` (whole-repo bloat scan), `/ponytail-debt` (harvest `ponytail:` shortcut comments into a ledger), `/ponytail-gain`, `/ponytail-help`. **No API keys; no third-party data transmission.** Installed (6 skills) to `.claude/skills/ponytail*` (Claude Code) and `.agents/skills/ponytail*` (Cursor + Codex).
- **Invocation-based here, not always-on.** Run `/ponytail` to activate it for a session. (Upstream also supports an always-on plugin install via `/plugin marketplace add DietrichGebert/ponytail` → `/plugin install ponytail@ponytail` in Claude Code; we use the skills route to keep it opt-in and committable, and to avoid stacking a second always-on directive on top of caveman.) Optional global config: `~/.config/ponytail/config.json` or `PONYTAIL_DEFAULT_MODE`.

### headroom — `chopratejas/headroom` (Apache-2.0)
A **token-compression MCP server** (also a CLI/proxy) that shrinks the **context fed to the model** — tool outputs, logs, file dumps — reversibly (`headroom_retrieve` fetches originals). Local-first, **no API keys**. MCP tools surface as `mcp__headroom__headroom_compress|retrieve|stats`. Launch: `headroom mcp serve` (wired in `.mcp.json` / `.cursor/mcp.json` / `.codex/config.toml`). For automatic compression of *all* traffic you can also run the proxy: `headroom proxy --port 8787` then `ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude` (optional; see `headroom mcp --help`).

### gbrain — `garrytan/gbrain` (MIT)
A **knowledge-graph memory MCP server** (+ CLI) on the **Bun** runtime: `gbrain capture` ingests notes, `gbrain search`/`query` does hybrid retrieval + synthesis. Launch: `gbrain serve` (stdio MCP). **Requires `gbrain init` once and an embedding key.**
- ⚠️ **Keys + data egress + cost:** set exactly one of `OPENAI_API_KEY` / `ZEROENTROPY_API_KEY` / `VOYAGE_API_KEY` (in `.env`). gbrain **sends the text it embeds and your queries to that provider** — recurring API cost and data leaving your machine. It is **inert until initialized with a key**; don't point it at content you don't want shared. The local store (PGLite) is gitignored.

## Per-agent wiring
| | MCP servers (headroom, gbrain) | Skills (improve, mattpocock, caveman, ponytail) | Plugin (superpowers) |
|---|---|---|---|
| **Claude Code** | `.mcp.json` (auto-discovered) | `.claude/skills/` (incl. mattpocock) | `.claude/settings.json` (auto-enabled) |
| **Cursor** | `.cursor/mcp.json` | `.agents/skills/` + `.cursor/rules/` (caveman) | — (no plugin support) |
| **Codex** | `~/.codex/config.toml` (copy from `.codex/config.toml`, or `codex mcp add …`) | `.agents/skills/` + `AGENTS.md` | `codex plugin marketplace add/install` (per-machine) |
| **GitHub Copilot CLI** | — | — | `copilot plugin marketplace add/install` (per-machine) |

Committed so a clone is wired up: `.mcp.json`, `.cursor/`, `.codex/config.toml`, `.claude/skills/`, `.agents/skills/`, `AGENTS.md`, `CLAUDE.md`, `skills-lock.json`. Opening the repo in Claude Code/Cursor will prompt to start the `headroom` + `gbrain` MCP servers — decline if unwanted.

## Install
```bash
bash scripts/setup-agent-tools.sh           # all seven
bash scripts/setup-agent-tools.sh --no-gbrain   # skip the key/egress one
```
Requires: Node ≥18 (`npx`), Python ≥3.10 (`pip`) for headroom, and Bun for gbrain. Put `$HOME/.local/bin` (headroom) and `$HOME/.bun/bin` (gbrain) on your `PATH`.

## Trust / provenance
- All seven are MIT/Apache-2.0 OSS. `improve`, `mattpocock/skills`, `ponytail`, `superpowers`, and `headroom` are read-only/local with no egress (superpowers has optional, disable-able telemetry). `caveman` installs via a `curl|bash` shim that forwards to `npx github:JuliusBrussee/caveman`. `gbrain` is the only one with third-party data egress + cost.
- `npx skills add … --copy` writes real files (not symlinks) so they're committable and reviewable. `skills-lock.json` pins versions.
- Review skill files before trusting them — they run with full agent permissions.


## Maintenance gates

Agent-tooling changes count as repo behavior changes. Update `AGENTS.md`, this file, or another relevant README in the same change when editing `.agents/`, `.claude/`, `.codex/`, `.cursor/`, `.mcp.json`, or setup scripts. The `docs:freshness` CI gate and `.githooks/pre-commit` hook enforce that code/tooling changes include a docs update.
