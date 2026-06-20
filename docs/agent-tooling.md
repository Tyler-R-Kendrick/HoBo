# Agent tooling

Four third-party AI-coding tools are wired into this repo for **Claude Code**, **Cursor**, and **Codex**. This page is the reference; the at-a-glance table + always-on caveman directive live in [`../AGENTS.md`](../AGENTS.md). Install the binaries with [`../scripts/setup-agent-tools.sh`](../scripts/setup-agent-tools.sh).

> **Note:** this is *tooling* config, not part of the HoBo product design (`docs/design/`). It was added on request to make the three agents productive in this repo.

## The four tools

### improve — `shadcn/improve` (MIT)
A **read-only agent skill**: surveys the codebase and writes prioritized, self-contained implementation **plans** to `plans/` for other (cheaper) agents to execute. It never edits source. Commands: `/improve`, `/improve quick`, `/improve deep`, `/improve security|perf|tests|bugs`, `/improve branch`, `/improve next`, `/improve plan <desc>`, `/improve execute <plan>`, `/improve reconcile`. No API keys. Installed to `.claude/skills/improve` (Claude Code) and `.agents/skills/improve` (Cursor + Codex).

### caveman — `JuliusBrussee/caveman` (MIT)
A **skill + always-on rule** that compresses the agent's **output** (~65–87% fewer tokens) while preserving technical accuracy. Commands: `/caveman [lite|full|ultra|wenyan]`, `/caveman-commit`, `/caveman-review`, `/caveman-compress <file>`, `/caveman-stats`. No API keys. Installed to `.agents/skills/caveman*` (+ `cavecrew`), `.cursor/rules/caveman.mdc` (`alwaysApply: true`), a `## Caveman mode (active)` block in `AGENTS.md`, and (for Claude Code) a global `claude` plugin. Optional env `CAVEMAN_STATUSLINE_SAVINGS=0`.
- **It is ON by default.** To disable: delete `.cursor/rules/caveman.mdc`, remove the `<!-- caveman:begin … end -->` block from `AGENTS.md`, and run `npx -y github:JuliusBrussee/caveman -- --uninstall`.

### headroom — `chopratejas/headroom` (Apache-2.0)
A **token-compression MCP server** (also a CLI/proxy) that shrinks the **context fed to the model** — tool outputs, logs, file dumps — reversibly (`headroom_retrieve` fetches originals). Local-first, **no API keys**. MCP tools surface as `mcp__headroom__headroom_compress|retrieve|stats`. Launch: `headroom mcp serve` (wired in `.mcp.json` / `.cursor/mcp.json` / `.codex/config.toml`). For automatic compression of *all* traffic you can also run the proxy: `headroom proxy --port 8787` then `ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude` (optional; see `headroom mcp --help`).

### gbrain — `garrytan/gbrain` (MIT)
A **knowledge-graph memory MCP server** (+ CLI) on the **Bun** runtime: `gbrain capture` ingests notes, `gbrain search`/`query` does hybrid retrieval + synthesis. Launch: `gbrain serve` (stdio MCP). **Requires `gbrain init` once and an embedding key.**
- ⚠️ **Keys + data egress + cost:** set exactly one of `OPENAI_API_KEY` / `ZEROENTROPY_API_KEY` / `VOYAGE_API_KEY` (in `.env`). gbrain **sends the text it embeds and your queries to that provider** — recurring API cost and data leaving your machine. It is **inert until initialized with a key**; don't point it at content you don't want shared. The local store (PGLite) is gitignored.

## Per-agent wiring
| | MCP servers (headroom, gbrain) | Skills (improve, caveman) |
|---|---|---|
| **Claude Code** | `.mcp.json` (auto-discovered) | `.claude/skills/` |
| **Cursor** | `.cursor/mcp.json` | `.agents/skills/` + `.cursor/rules/` |
| **Codex** | `~/.codex/config.toml` (copy from `.codex/config.toml`, or `codex mcp add …`) | `.agents/skills/` + `AGENTS.md` |

Committed so a clone is wired up: `.mcp.json`, `.cursor/`, `.codex/config.toml`, `.claude/skills/`, `.agents/skills/`, `AGENTS.md`, `CLAUDE.md`, `skills-lock.json`. Opening the repo in Claude Code/Cursor will prompt to start the `headroom` + `gbrain` MCP servers — decline if unwanted.

## Install
```bash
bash scripts/setup-agent-tools.sh           # all four
bash scripts/setup-agent-tools.sh --no-gbrain   # skip the key/egress one
```
Requires: Node ≥18 (`npx`), Python ≥3.10 (`pip`) for headroom, and Bun for gbrain. Put `$HOME/.local/bin` (headroom) and `$HOME/.bun/bin` (gbrain) on your `PATH`.

## Trust / provenance
- All four are MIT/Apache-2.0 OSS. `improve` and `headroom` are read-only/local. `caveman` installs via a `curl|bash` shim that forwards to `npx github:JuliusBrussee/caveman`. `gbrain` is the only one with third-party data egress + cost.
- `npx skills add … --copy` writes real files (not symlinks) so they're committable and reviewable. `skills-lock.json` pins versions.
- Review skill files before trusting them — they run with full agent permissions.
