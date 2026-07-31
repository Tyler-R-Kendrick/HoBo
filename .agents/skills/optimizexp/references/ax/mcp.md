---
type: Agent Skill Reference
title: "OptimizeXP AX — MCP"
description: "MCP server wiring, shared launchers, and agent ergonomics for tool use."
tags: [hobo, optimizexp, ax, mcp]
timestamp: 2026-07-30T00:00:00Z
---

# AX — MCP

## Goals

- Agents discover tools quickly
- Shared launchers across Claude Code / Cursor / Codex
- Fail closed on missing keys; no surprise egress

## HoBo anchors

| Config | Host |
|---|---|
| `.mcp.json` | Claude Code |
| `.cursor/mcp.json` | Cursor |
| `.codex/config.toml` | Codex template |
| `scripts/agent-mcp-serena.sh` | Shared Serena launcher |

Servers commonly wired: Serena (semantic code), headroom (context compress), gbrain (memory — key required).

## Friction smells

- Three divergent MCP configs that drift
- Tools require global installs not covered by setup script
- Tool schemas huge and always loaded

## Uncertainty / harms smells

- gbrain embeds private text without clear warning in-session
- Failed MCP connect hangs agent without fallback
- Tool names unstable across versions

## Optimization moves

- Single launcher scripts under `scripts/`
- Document key + egress risks next to enable steps (`AUTH.md` / agent-tooling)
- Prefer local-first servers for default path
- Exp proofs for MCP: transcripts + tool schemas under `src/draft/exp-proofs/ax/`
