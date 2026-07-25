---
layout: ../../layouts/Docs.astro
title: An agent-native repository
description: How AI coding agents use, run, and extend the HoBo repo — supported harnesses, entry points, and what's wired out of the box.
---

# An agent-native repository

HoBo designs a platform where agents are first-class users — and the repository practices what it designs. The repo ships committed configuration for **Claude Code**, **Cursor**, and **Codex** (plus **GitHub Copilot CLI** for the Superpowers plugin), so a fresh clone is already wired for agent work.

> **Rule zero for agents:** read [`AGENTS.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/AGENTS.md) before editing anything. It is the repo's contract for agents — tooling, guardrails, architecture rules, and validation policy. This site also serves a machine-readable briefing at [`llms.txt`](/HoBo/llms.txt).

## What's wired on clone

| Surface | Where | What it does |
|---|---|---|
| **Agent instructions** | `AGENTS.md`, `CLAUDE.md` | Repo-level rules every harness reads. |
| **Skills** | `.claude/skills/`, `.agents/skills/` | Repo-local skills (`repo`, `draft`, `sdlc`) plus installed skill packs, mirrored byte-identical for Claude Code and Cursor/Codex. |
| **MCP servers** | `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml` | Serena (semantic code), headroom (context compression), gbrain (knowledge-graph memory — needs a key, off by default). |
| **Subagents** | `.claude/agents/` | `implementer` and `reviewer` definitions used by the sdlc loop. |
| **Plugin** | `.claude/settings.json` | Superpowers methodology plugin auto-enables for Claude Code. |
| **Setup script** | `scripts/setup-agent-tools.sh` | One-time install of the tool binaries, progressive per-agent layers. |

## The tour

- **[Tooling & MCP](/HoBo/agents/tooling/)** — the twelve wired tools, what each is for, install layers, and the keys/egress risks to know before enabling gbrain.
- **[Skills & workflows](/HoBo/agents/skills/)** — the repo-local `repo`, `draft`, and `sdlc` skills: the performance-first loop, the proof taxonomy, and the coordinated implementer/reviewer development loop.
- **[Rules & guardrails](/HoBo/agents/rules/)** — the architecture rules every change must satisfy, the command ladder, testing lanes, and the validation-failure policy.

## Expect terse output

The **caveman** output-compression directive is on by default (`AGENTS.md` carries the block): agents respond tersely to save tokens, dropping filler while keeping technical substance. Code, commits, and PRs are written normally. Say "stop caveman" / "normal mode" to disable for a session.

## For agent authors

If you're building agent tooling *against* HoBo-the-product (rather than working in the repo), the design docs to read are [AI-native platform & agent auth](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/ai-native-agent-auth.md) — agents as principals, capability manifests, token brokering — and [Operators & SRE](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/operators-sre.md) — the built-in operator Crew. The MCP surface is designed in [`packages/mcp`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/packages/mcp).
