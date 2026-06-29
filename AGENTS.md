# Agent tooling for this repo

This repo is wired for **Claude Code**, **Cursor**, and **Codex** (plus **GitHub Copilot CLI** for Superpowers) with seven installable agent tools. Full reference + risks: [`docs/agent-tooling.md`](docs/agent-tooling.md). One-time binary install: [`scripts/setup-agent-tools.sh`](scripts/setup-agent-tools.sh).

| Tool | Type | What it does | Invoke |
|---|---|---|---|
| **improve** (`shadcn/improve`) | skill (read-only) | Audits the codebase and writes prioritized implementation **plans** to `docs/plans/` for other agents to execute. Never edits source. | `/improve`, `/improve quick`, `/improve security`, `/improve execute <plan>` |
| **superpowers** (`obra/Superpowers`) | plugin (skills library) | A development **methodology**: structured **brainstorming**, plan-writing, TDD, systematic debugging, subagent-driven dev, and code-review workflows. No keys. | `brainstorming`, `writing-plans`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, … (14 skills) |
| **mattpocock/skills** (`mattpocock/skills`) | skills collection | Engineering disciplines: **`grill-with-docs`** (relentless design interview that writes ADRs + glossary), `domain-modeling`, `codebase-design`, `diagnosing-bugs`, `tdd`, `to-prd`, `to-issues`, `prototype`, … No keys. | `/grill-with-docs`, `/ask-matt`, `/domain-modeling`, `/setup-matt-pocock-skills` (one-time config) |
| **caveman** (`JuliusBrussee/caveman`) | skill + rules | Compresses **agent output** (~65–87% fewer tokens) while keeping technical accuracy. | active by default (see below); `/caveman [lite\|full\|ultra\|wenyan]`, `/caveman-commit`, `/caveman-review`, `/caveman-stats` |
| **ponytail** (`DietrichGebert/ponytail`) | skill | Pushes the **minimalist solution** — YAGNI, stdlib/native before dependencies, one line before fifty; reviews/audits for over-engineering. No keys. | `/ponytail [lite\|full\|ultra]`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help` |
| **headroom** (`chopratejas/headroom`) | MCP server | Compresses **context fed to the model** (tool outputs, logs, files); reversible via `headroom_retrieve`. Local-first, no keys. | MCP tools `mcp__headroom__*`; optional proxy `headroom proxy` |
| **gbrain** (`garrytan/gbrain`) | MCP server | Knowledge-graph **memory**: capture notes, hybrid search + synthesis. | MCP tools after `gbrain init`; CLI `gbrain capture/search/query` |

How they fit together: **superpowers** + **mattpocock/skills** supply the *workflow & rigor* (brainstorm → grill-with-docs → plan → build/TDD → review), **improve** decides *what* to do, **ponytail** keeps the code itself minimal (YAGNI / stdlib-first), **headroom** + **caveman** keep token use down (context-in vs output-out — complementary), **gbrain** remembers across sessions.

## Documentation maintenance rule

Whenever a change touches code, automation, package metadata, CI, hooks, or agent tooling, update the matching documentation in the same change. At minimum, check whether `README.md`, `docs/design/index.md`, `docs/agent-tooling.md`, and the relevant proof/contract README still describe the current state. If no user-facing docs change is needed, add or update the closest maintenance note so reviewers can see that docs were considered.

Local and CI gates enforce this with `npm run docs:freshness`: code changes under `src/`, `scripts/`, `test/`, package metadata, workflows, or agent config must be accompanied by a docs change. The repo hook in `.githooks/pre-commit` runs tests, docs linters, docs coverage, traceability checks, contract validators, and docs freshness; enable it with `npm run prepare-hooks`.

## Keys & risks (read before enabling gbrain)
- **gbrain needs an embedding key** (`OPENAI_API_KEY` *or* `ZEROENTROPY_API_KEY` *or* `VOYAGE_API_KEY`) and **sends the text it embeds + your queries to that provider** — recurring cost + data egress. It is **inert until you run `gbrain init` and set a key**. Don't point it at sensitive content you don't want leaving your machine. Configure via `.env` (see `.env.example`).
- **headroom / improve / caveman / ponytail / superpowers** need **no keys** and run locally; superpowers has optional telemetry (set `SUPERPOWERS_DISABLE_TELEMETRY=1` to disable).
- **caveman** was installed via a `curl … | bash` shim (forwarding to `npx github:JuliusBrussee/caveman`); the pinned installer is handled in `scripts/setup-agent-tools.sh`.
- Committing `.mcp.json` / `.cursor/mcp.json` means opening this repo in Claude Code or Cursor will prompt to launch the `headroom` and `gbrain` MCP servers. Decline if you don't want them.

## MCP wiring (per agent)
- **Claude Code** — `.mcp.json` (auto-discovered) defines `headroom` + `gbrain`.
- **Cursor** — `.cursor/mcp.json` (same two servers).
- **Codex** — copy `.codex/config.toml`'s `[mcp_servers.*]` into `~/.codex/config.toml`, or run `codex mcp add …` (see the setup script). Codex reads MCP config globally, not per-project.

Skills (`improve`, `caveman`, `ponytail`) live in `.claude/skills/` (Claude Code) and `.agents/skills/` (Cursor + Codex). ponytail is invocation-based here (`/ponytail …`), not always-on — run `/ponytail` to activate it for a session (it can be made always-on via `/plugin install ponytail@ponytail` in Claude Code if you want that).

## Superpowers plugin (Claude Code · Codex · Copilot)
`superpowers` is a **plugin** (not a skills-dir install), from the `obra/superpowers-marketplace`. It's wired repo-portably for **Claude Code** via [`.claude/settings.json`](.claude/settings.json) (`extraKnownMarketplaces` + `enabledPlugins`), so it auto-enables when you open the repo. For **Codex** and **GitHub Copilot CLI**, install per-machine (the setup script runs these if those CLIs are present):
```
# Claude Code (also: handled by .claude/settings.json):
claude plugin marketplace add obra/superpowers-marketplace && claude plugin install superpowers@superpowers-marketplace
# Codex CLI:
codex plugin marketplace add obra/superpowers-marketplace && codex plugin install superpowers@superpowers-marketplace
# GitHub Copilot CLI:
copilot plugin marketplace add obra/superpowers-marketplace && copilot plugin install superpowers@superpowers-marketplace
```
Skills load at **session start** (a SessionStart hook), so enable it, then start a fresh session to use `brainstorming`, `writing-plans`, `requesting-code-review`, etc.

<!-- caveman:begin — terse-output directive. Caveman mode is INSTALLED and ON by default.
     To disable: delete `.cursor/rules/caveman.mdc`, remove this block, and run
     `npx -y github:JuliusBrussee/caveman -- --uninstall`. -->
## Caveman mode (active)
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan. Stop: "stop caveman" or "normal mode".
Auto-Clarity: drop caveman for security warnings, irreversible actions, or a confused user. Resume after.
Boundaries: code/commits/PRs written normal.
<!-- caveman:end -->
