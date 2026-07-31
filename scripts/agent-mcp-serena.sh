#!/usr/bin/env bash
# Start Serena's MCP server for this checkout.
# Shared by Claude Code / Cursor / Codex so a missing binary prints remediation
# instead of a bare host "command not found".
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v serena >/dev/null 2>&1; then
  cat >&2 <<'EOF'
serena MCP: binary not on PATH.

Install the common zero-key layer:
  bash scripts/setup-agent-tools.sh --common-only --no-gbrain

Ensure $HOME/.local/bin is on PATH. Narrative: docs/agent-tooling.md · table: AGENTS.md
EOF
  exit 1
fi

exec serena start-mcp-server --project "$repo_root" "$@"
