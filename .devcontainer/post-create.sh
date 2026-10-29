#!/usr/bin/env bash
# Devcontainer bootstrap: install project deps and common, agent-agnostic helper
# tools. Agent-specific CLI/plugin setup stays opt-in; see docs/agent-tooling.md.
set -euo pipefail
cd "$(dirname "$0")/.."

# The remote user cannot write Corepack's default /usr/local/bin shim directory.
mkdir -p .tools/ci
corepack enable pnpm --install-directory .tools/ci
export PATH="$PWD/.tools/ci:$PATH"
pnpm install --frozen-lockfile --config.confirmModulesPurge=false
pnpm exec turbo run build --filter=@hobo/ci-gh-actions --concurrency=100%
node --import tsx packages/ci-gh-actions/scripts/act-install.ts --directory .tools/ci
bash scripts/setup-agent-tools.sh --common-only --no-gbrain
