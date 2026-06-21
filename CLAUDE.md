# CLAUDE.md

**Repo:** HoBo — a cloud-agnostic, AI-native hosting platform, currently in the **design phase**. The design suite is in [`docs/design/`](docs/design/README.md); formal requirements in [`docs/requirements/`](docs/requirements/README.md); competitor research in [`competitors/`](competitors/README.md). No **HoBo product** implementation code yet — the only code present is third-party agent-tooling under `.agents/`/`.claude/`/`scripts/`.

## Agent tooling
This repo is wired with five agent tools for Claude Code, Cursor, and Codex — see **[`AGENTS.md`](AGENTS.md)** for the full table and **[`docs/agent-tooling.md`](docs/agent-tooling.md)** for setup/keys/risks. Quick map:
- **improve** — `/improve` audits the repo and writes plans to `plans/` (read-only).
- **caveman** — terse-output compression (active by default; `/caveman` to adjust).
- **ponytail** — minimalist-solution skill (YAGNI/stdlib-first); `/ponytail`, `/ponytail-review`, `/ponytail-audit` (invocation-based, no keys).
- **headroom** — MCP server compressing context fed to the model (`mcp__headroom__*`).
- **gbrain** — MCP server for knowledge-graph memory (needs `gbrain init` + an embedding key; **sends content to that provider**).

Install the binaries once with [`scripts/setup-agent-tools.sh`](scripts/setup-agent-tools.sh). MCP servers are defined in `.mcp.json` (auto-discovered).

## Working norms
- This is a documentation repo: prefer editing the numbered design docs; keep cross-doc links valid (relative `.md` links).
- Conventional, scoped commits; branch `claude/charming-volta-lzlf0m`; changes land on PR #1.
