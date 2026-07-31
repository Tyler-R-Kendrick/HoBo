#!/usr/bin/env bash
# Init an OptimizeXP run directory for Claude Code / any host.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RUN_ID="${1:-$(date -u +%Y%m%d)-manual}"
RUN_DIR="$ROOT/.optimizexp/runs/$RUN_ID"
mkdir -p "$RUN_DIR/iterations" "$RUN_DIR/artifacts" "$ROOT/.optimizexp/bus/entries"
if [[ ! -f "$RUN_DIR/scope.json" ]]; then
  cat >"$RUN_DIR/scope.json" <<EOF
{
  "runId": "$RUN_ID",
  "experiences": ["ux", "dx", "ax"],
  "personas": [],
  "surfaces": [],
  "hostAgent": "claude-code",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
fi
echo "run ready: $RUN_DIR"
