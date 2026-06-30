#!/usr/bin/env bash
# Devcontainer bootstrap: install project deps and common, agent-agnostic helper
# tools. Agent-specific CLI/plugin setup stays opt-in; see docs/agent-tooling.md.
set -euo pipefail
cd "$(dirname "$0")/.."

corepack enable pnpm
pnpm install --frozen-lockfile --config.confirmModulesPurge=false
bash scripts/setup-agent-tools.sh --common-only --no-gbrain
