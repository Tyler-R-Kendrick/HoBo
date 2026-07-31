#!/usr/bin/env bash
# Start gbrain's MCP server for this checkout with fail-closed remediation.
# Shared by Claude Code / Cursor / Codex (.mcp.json, .cursor/mcp.json, .codex/config.toml)
# so missing binary or embedding keys print AUTH.md guidance instead of a bare "command not found".
set -euo pipefail

if ! command -v gbrain >/dev/null 2>&1; then
  cat >&2 <<'EOF'
gbrain MCP: binary not on PATH.

Zero-key default (recommended): decline the gbrain MCP server in your agent UI, or never enable it.
  bash scripts/setup-agent-tools.sh --common-only --no-gbrain

To enable later: install Bun, re-run setup without --no-gbrain, then `gbrain init`.
Keys + data egress: AUTH.md  |  .env.example  |  docs/agent-tooling.md
EOF
  exit 1
fi

if [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${ZEROENTROPY_API_KEY:-}" ] && [ -z "${VOYAGE_API_KEY:-}" ]; then
  cat >&2 <<'EOF'
gbrain MCP: no embedding key set.

Set exactly one of:
  OPENAI_API_KEY | ZEROENTROPY_API_KEY | VOYAGE_API_KEY
(copy .env.example → .env). Embedding and query text leave the machine (cost + egress).

Or decline this MCP server for a zero-key session. See AUTH.md.
EOF
  exit 1
fi

exec gbrain serve "$@"
