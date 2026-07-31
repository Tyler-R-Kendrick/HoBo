# AUTH — keys, egress, and agent credentials

Standing auth surface for humans and coding agents. Prefer this file for “what needs a key?”; full tooling narrative lives in [`docs/agent-tooling.md`](docs/agent-tooling.md). Copy [`.env.example`](.env.example) to `.env` (gitignored) only for tools you enable.

## Default: zero keys

These need **no API keys** and stay local-first:

| Tool | Notes |
|---|---|
| Serena, headroom, RTK | Local MCP/CLI |
| improve, caveman, ponytail, superpowers skills | No keys; Superpowers may have optional telemetry (`SUPERPOWERS_DISABLE_TELEMETRY=1`) |
| tgrep, ast-grep | Local binaries |
| optimizexp review loop | Local bus + scorer; no network |

Recommended first setup:

```bash
bash scripts/setup-agent-tools.sh --help                 # usage (no install)
bash scripts/setup-agent-tools.sh --common-only --no-gbrain
```

## Tools that need keys (opt-in)

| Tool | Env vars | Data egress | Cost |
|---|---|---|---|
| **gbrain** | Exactly one of `OPENAI_API_KEY`, `ZEROENTROPY_API_KEY`, `VOYAGE_API_KEY` | Text embedded + queries go to that provider | Recurring embedding/API |
| **SkillOpt** live backends | Provider-specific (`ANTHROPIC_API_KEY`, Azure OpenAI, Qwen, MiniMax, …) | Prompts/code to chosen backend | Per-run |
| Product cloud providers | Per-Camp / secretless federation (see design ADRs) | Per provider | Per provider |

gbrain MCP is launched via [`scripts/agent-mcp-gbrain.sh`](scripts/agent-mcp-gbrain.sh), which **fails closed** when the binary or an embedding key is missing (prints remediation here). The binary itself stays **inert** until `gbrain init` **and** a key is set. Do not point it at secrets or content you will not send to a third party.

## Agent rules

1. Never commit `.env`, tokens, or private keys.
2. Never paste secret values into issues, bus entries, or skill files — reference `file:line` / env var **names** only.
3. Prefer identity federation / bound resources over stored secrets in product code ([ADR-0027](docs/design/adr/02-identity-security.md) family).
4. Decline optional MCP servers (gbrain) when you do not want egress.
5. OptimizeXP bus transcripts under `.optimizexp/` must redact secret-shaped strings.

## Per-agent config locations

| Host | MCP | Skills |
|---|---|---|
| Claude Code | `.mcp.json` | `.claude/skills/` |
| Cursor | `.cursor/mcp.json` | `.agents/skills/` |
| Codex | `~/.codex/config.toml` (from `.codex/config.toml`) | `.agents/skills/` |

## Related

- [`.env.example`](.env.example)
- [`docs/agent-tooling.md`](docs/agent-tooling.md) § Keys & risks
- OptimizeXP AX auth reference: `.agents/skills/optimizexp/references/ax/auth.md`
