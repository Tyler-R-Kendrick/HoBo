---
type: Agent Skill Reference
title: "OptimizeXP AX — agents and CLIs"
description: "Configuring and using coding agents, subagents, and their CLIs consistently."
tags: [hobo, optimizexp, ax, agents, cli]
timestamp: 2026-07-30T00:00:00Z
---

# AX — specific agents & CLIs

## Host matrix (HoBo)

| Host | Skills tree | MCP config | Plugins | Subagents |
|---|---|---|---|---|
| Claude Code | `.claude/skills` | `.mcp.json` | `.claude/settings.json` | `.claude/agents/` |
| Cursor | `.agents/skills` | `.cursor/mcp.json` | rules | — |
| Codex | `.agents/skills` | `~/.codex/config.toml` | marketplace (machine) | — |
| Grok Build | skill discovery + workflows | MCP via product | workflows | subagent tool |
| Copilot CLI | limited | — | marketplace | — |

## Subagents (Claude Code backend for sdlc)

- `implementer` — one issue, worktree, TDD, handback `.sdlc/report.json`
- `reviewer` — read-only re-run gates

## CLI ergonomics to score

- Help text discoverable (`--help`, consistent verbs)
- Non-zero exit on failure; machine-readable modes when claimed
- Auth errors distinguish "not logged in" vs "forbidden"
- Setup script documents exact install commands per host

## Friction smells

- Per-machine plugin install required with no script path
- Agent-specific features undocumented for other hosts
- Subagent prompts omit hard rules (secrets, no shared files)

## Optimization moves

- Shared setup: `scripts/setup-agent-tools.sh --agent <name>`
- Same one-shot issue contract across backends (`sdlc` dispatch)
- Document resume/reconcile paths
