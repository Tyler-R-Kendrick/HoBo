# Agent tooling for this repo

This repo is wired for **Claude Code**, **Cursor**, and **Codex** with five installable agent tools. Full reference + risks: [`docs/agent-tooling.md`](docs/agent-tooling.md). One-time binary install: [`scripts/setup-agent-tools.sh`](scripts/setup-agent-tools.sh).

| Tool | Type | What it does | Invoke |
|---|---|---|---|
| **improve** (`shadcn/improve`) | skill (read-only) | Audits the codebase and writes prioritized implementation **plans** to `plans/` for other agents to execute. Never edits source. | `/improve`, `/improve quick`, `/improve security`, `/improve execute <plan>` |
| **caveman** (`JuliusBrussee/caveman`) | skill + rules | Compresses **agent output** (~65–87% fewer tokens) while keeping technical accuracy. | active by default (see below); `/caveman [lite\|full\|ultra\|wenyan]`, `/caveman-commit`, `/caveman-review`, `/caveman-stats` |
| **ponytail** (`DietrichGebert/ponytail`) | skill | Pushes the **minimalist solution** — YAGNI, stdlib/native before dependencies, one line before fifty; reviews/audits for over-engineering. No keys. | `/ponytail [lite\|full\|ultra]`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help` |
| **headroom** (`chopratejas/headroom`) | MCP server | Compresses **context fed to the model** (tool outputs, logs, files); reversible via `headroom_retrieve`. Local-first, no keys. | MCP tools `mcp__headroom__*`; optional proxy `headroom proxy` |
| **gbrain** (`garrytan/gbrain`) | MCP server | Knowledge-graph **memory**: capture notes, hybrid search + synthesis. | MCP tools after `gbrain init`; CLI `gbrain capture/search/query` |

How they fit together: **improve** decides *what* to do, **ponytail** keeps the code itself minimal (YAGNI / stdlib-first), **headroom** + **caveman** keep token use down (context-in vs output-out — complementary), **gbrain** remembers across sessions.

## Keys & risks (read before enabling gbrain)
- **gbrain needs an embedding key** (`OPENAI_API_KEY` *or* `ZEROENTROPY_API_KEY` *or* `VOYAGE_API_KEY`) and **sends the text it embeds + your queries to that provider** — recurring cost + data egress. It is **inert until you run `gbrain init` and set a key**. Don't point it at sensitive content you don't want leaving your machine. Configure via `.env` (see `.env.example`).
- **headroom / improve / caveman / ponytail** need **no keys** and run locally; ponytail sends no data anywhere.
- **caveman** was installed via a `curl … | bash` shim (forwarding to `npx github:JuliusBrussee/caveman`); the pinned installer is handled in `scripts/setup-agent-tools.sh`.
- Committing `.mcp.json` / `.cursor/mcp.json` means opening this repo in Claude Code or Cursor will prompt to launch the `headroom` and `gbrain` MCP servers. Decline if you don't want them.

## MCP wiring (per agent)
- **Claude Code** — `.mcp.json` (auto-discovered) defines `headroom` + `gbrain`.
- **Cursor** — `.cursor/mcp.json` (same two servers).
- **Codex** — copy `.codex/config.toml`'s `[mcp_servers.*]` into `~/.codex/config.toml`, or run `codex mcp add …` (see the setup script). Codex reads MCP config globally, not per-project.

Skills (`improve`, `caveman`, `ponytail`) live in `.claude/skills/` (Claude Code) and `.agents/skills/` (Cursor + Codex). ponytail is invocation-based here (`/ponytail …`), not always-on — run `/ponytail` to activate it for a session (it can be made always-on via `/plugin install ponytail@ponytail` in Claude Code if you want that).

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
