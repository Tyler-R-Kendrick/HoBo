#!/usr/bin/env bash
# Devcontainer bootstrap: install project deps and common, agent-agnostic helper
# tools. Agent-specific CLI/plugin setup stays opt-in; see docs/agent-tooling.md.
set -euo pipefail
cd "$(dirname "$0")/.."

npm install
bash scripts/setup-agent-tools.sh --common-only --no-gbrain
