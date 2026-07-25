---
layout: ../../layouts/Docs.astro
title: Tooling & MCP
description: "The twelve agent tools wired into the HoBo repo — skills, CLIs, and MCP servers — plus setup layers and the keys/data-egress risks."
---

# Tooling & MCP

Twelve third-party tools plus repo-local skills are wired in for Claude Code, Cursor, and Codex. The full reference (with install detail and risk notes) is [`docs/agent-tooling.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/agent-tooling.md); this page is the orientation.

## The twelve tools

| Tool | Type | What it does |
|---|---|---|
| **improve** | skill (read-only) | Audits the codebase and writes prioritized plans to `docs/plans/` for other agents to execute. Never edits source. |
| **superpowers** | plugin | Development methodology: brainstorming, writing-plans, TDD, systematic debugging, code review (14 skills). Loads at session start. |
| **mattpocock/skills** | skills | Engineering disciplines: `grill-with-docs` (design interview → ADRs + glossary), `domain-modeling`, `codebase-design`, `tdd`, more. |
| **caveman** | skill + rule | Compresses agent **output** (~65–87% fewer tokens) while keeping technical substance. On by default. |
| **ponytail** | skill | Pushes the minimalist solution: YAGNI, stdlib before dependencies, one line before fifty. Invocation-based (`/ponytail`). |
| **tgrep** | CLI | Trigram-indexed exact/regex search — `pnpm run search <pattern>` before any test-as-discovery. |
| **ast-grep** | CLI | AST structural search/rewrite — `pnpm run search:structure`, repo-pinned with `sgconfig.yml`. |
| **Serena** | MCP server | IDE-like semantic retrieval and symbol-aware editing via language servers. Local, no keys. |
| **headroom** | MCP server | Compresses context **fed to** the model (tool outputs, logs); reversible via `headroom_retrieve`. Local, no keys. |
| **RTK** | CLI proxy | Compresses noisy shell output before agents see it (`rtk <cmd>`). |
| **gbrain** | MCP server | Knowledge-graph memory with hybrid search. **Needs an embedding key; sends embedded text to that provider.** Inert until initialized. |
| **SkillOpt** | optimizer | Offline research harness that trains reusable markdown skills from scored rollouts. Not runtime config. |

How they fit: Serena gives semantic code tools · superpowers + mattpocock supply workflow rigor · improve decides what to do · ponytail keeps code minimal · headroom/RTK/caveman cut tokens on context-in, shell output, and agent output · gbrain remembers across sessions.

## Install

```sh
bash scripts/setup-agent-tools.sh --common-only --no-gbrain   # devcontainer-safe layer
bash scripts/setup-agent-tools.sh --agent claude-code --no-gbrain
bash scripts/setup-agent-tools.sh --agent cursor --no-gbrain
bash scripts/setup-agent-tools.sh --agent codex --no-gbrain
```

Start with the common layer; add exactly one agent shim when you need it. Devcontainers run the common layer automatically via `post-create.sh`.

## MCP wiring per harness

| Harness | MCP config | Skills |
|---|---|---|
| Claude Code | `.mcp.json` (auto-discovered) | `.claude/skills/` |
| Cursor | `.cursor/mcp.json` | `.agents/skills/` + `.cursor/rules/` |
| Codex | copy `.codex/config.toml` → `~/.codex/config.toml` | `.agents/skills/` + `AGENTS.md` |
| Copilot CLI | — | Superpowers plugin only |

Opening the repo in Claude Code or Cursor will prompt to launch the `serena`, `headroom`, and `gbrain` MCP servers — decline if unwanted.

## Keys & risks — read before enabling gbrain

- **gbrain** requires one embedding key (`OPENAI_API_KEY` / `ZEROENTROPY_API_KEY` / `VOYAGE_API_KEY`) and **sends the text it embeds plus your queries to that provider** — recurring cost and data egress. It is inert until you run `gbrain init` with a key. Don't point it at content that shouldn't leave your machine.
- Everything else (Serena, headroom, RTK, improve, caveman, ponytail, superpowers) runs locally with no keys; superpowers has optional telemetry (`SUPERPOWERS_DISABLE_TELEMETRY=1`).
- Skill files run with full agent permissions — review them before trusting them. `skills-lock.json` pins versions.
