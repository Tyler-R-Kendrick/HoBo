#!/usr/bin/env bash
# Start Serena's MCP server for this checkout.
# Kept as a repo-local wrapper so Claude Code, Cursor, and Codex can share one
# project-relative command instead of hard-coding per-agent absolute paths.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec serena start-mcp-server --project "$repo_root" "$@"
