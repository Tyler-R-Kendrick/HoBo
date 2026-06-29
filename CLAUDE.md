# CLAUDE.md

**Repo:** HoBo — a cloud-agnostic, AI-native hosting platform, currently in the **design phase**. The design suite is in [`docs/design/`](docs/design/index.md); formal requirements are archived in [`docs/archive/requirements/`](docs/archive/requirements/index.md); competitor research is in [`docs/competitors/`](docs/competitors/index.md). No **HoBo product** implementation code yet — the only code present is third-party agent-tooling under `.agents/`/`.claude/`/`scripts/`.

## Agent tooling
This repo is wired with nine agent tools for Claude Code, Cursor, and Codex (Superpowers also targets GitHub Copilot CLI) — see **[`AGENTS.md`](AGENTS.md)** for the full table and **[`docs/agent-tooling.md`](docs/agent-tooling.md)** for setup/keys/risks. Quick map:
- **improve** — `/improve` audits the repo and writes plans to `docs/plans/` (read-only).
- **superpowers** (`obra/Superpowers`) — plugin: dev methodology (brainstorming, writing-plans, code-review, TDD, debugging); enabled repo-wide via `.claude/settings.json`; loads at session start.
- **mattpocock/skills** — engineering disciplines incl. **`grill-with-docs`** (design interview → ADRs+glossary), `domain-modeling`, `codebase-design`, `tdd`; one-time `/setup-matt-pocock-skills` to configure.
- **caveman** — terse-output compression (active by default; `/caveman` to adjust).
- **ponytail** — minimalist-solution skill (YAGNI/stdlib-first); `/ponytail`, `/ponytail-review`, `/ponytail-audit` (invocation-based, no keys).
- **headroom** — MCP server compressing context fed to the model (`mcp__headroom__*`).
- **gbrain** — MCP server for knowledge-graph memory (needs `gbrain init` + an embedding key; **sends content to that provider**).

Install the binaries once with [`scripts/setup-agent-tools.sh`](scripts/setup-agent-tools.sh). MCP servers are defined in `.mcp.json` (auto-discovered).

## Working norms
- This is a documentation repo: prefer editing the numbered design docs; keep cross-doc links valid (relative `.md` links).
- Follow the HoBo implementation architecture rules in [`AGENTS.md`](AGENTS.md): PACT at service boundaries, protobuf plus CUE for records/messages/data/objects, parse-don't-validate derived types, and event-driven CQRS/actors/materialized views.
- Run `npm run architecture:guard` for implementation-package changes; pre-commit runs the staged variant before the slower tests.
- Conventional, scoped commits; branch `claude/charming-volta-lzlf0m`; changes land on PR #1.
