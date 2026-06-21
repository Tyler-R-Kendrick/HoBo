#!/usr/bin/env bash
# Set up the four agent tools (improve, caveman, headroom, gbrain) for
# Claude Code, Cursor, and Codex. Idempotent + best-effort: each step is
# independent and the script keeps going if one fails.
#
#   bash scripts/setup-agent-tools.sh            # install everything
#   bash scripts/setup-agent-tools.sh --no-gbrain  # skip gbrain (the one with API keys/egress)
#
# Re-running is safe. Nothing here accepts an API key for you.
set -uo pipefail
cd "$(dirname "$0")/.."

WANT_GBRAIN=1
for a in "$@"; do [ "$a" = "--no-gbrain" ] && WANT_GBRAIN=0; done

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
# `skills`/`npx`-based tools choke on a tsx-injecting NODE_OPTIONS; strip it.
NPX() { env -u NODE_OPTIONS npx "$@"; }

say "Probing runtimes"
for c in node npx python3 pip3 bun claude codex; do
  if have "$c"; then echo "  ok   $c"; else echo "  MISS $c"; fi
done

# 1) improve — read-only audit/plan skill (no keys). Scoped to the 3 agents.
say "improve (shadcn/improve) -> claude-code, cursor, codex skills"
if have npx; then
  for ag in claude-code cursor codex; do
    NPX --yes skills add shadcn/improve --project --copy -a "$ag" -s '*' -y \
      && echo "  installed for $ag" || echo "  FAILED for $ag"
  done
else echo "  SKIP: npx missing"; fi

# 1b) ponytail — minimalist-solution skill (no keys, no egress). Invocation-based (/ponytail).
say "ponytail (DietrichGebert/ponytail) -> claude-code, cursor, codex skills"
if have npx; then
  for ag in claude-code cursor codex; do
    NPX --yes skills add DietrichGebert/ponytail --project --copy -a "$ag" -s '*' -y \
      && echo "  installed for $ag" || echo "  FAILED for $ag"
  done
else echo "  SKIP: npx missing"; fi

# 2) caveman — output-compression skill/rules (no keys). curl|bash shim -> npx.
say "caveman (JuliusBrussee/caveman) -> claude, cursor, codex (+ repo rule files)"
if have npx; then
  NPX -y "github:JuliusBrussee/caveman" --only claude --only codex --only cursor --with-init --no-hooks \
    && echo "  installed" || echo "  FAILED"
  # caveman --with-init also drops rule files for non-target agents; trim them.
  rm -rf .windsurf .clinerules .opencode; rm -f .github/copilot-instructions.md; rmdir .github 2>/dev/null || true
else echo "  SKIP: npx missing"; fi

# 3) headroom — token-compression MCP server (no keys). Python wheel.
say "headroom (chopratejas/headroom) -> pip + register MCP"
if have python3; then
  python3 -m pip install --user "headroom-ai[mcp]" 2>/dev/null \
    || python3 -m pip install --user --break-system-packages "headroom-ai[mcp]" \
    && echo "  installed ($(headroom --version 2>/dev/null || echo '?'))" || echo "  FAILED"
else echo "  SKIP: python3 missing"; fi

# 4) gbrain — knowledge-graph MCP server. NEEDS Bun + an embedding API key.
#    WARNING: gbrain sends embedded text + queries to your chosen provider
#    (recurring cost + data egress). Inert until `gbrain init` + a key.
if [ "$WANT_GBRAIN" = "1" ]; then
  say "gbrain (garrytan/gbrain) -> bun install"
  if have bun; then
    bun install -g github:garrytan/gbrain && echo "  installed ($(gbrain --version 2>/dev/null || echo '?'))" || echo "  FAILED"
    echo "  NEXT (manual, you decide): set OPENAI_API_KEY|ZEROENTROPY_API_KEY|VOYAGE_API_KEY, then 'gbrain init --pglite'."
    echo "  NOTE: gbrain sends embedding/query text to that provider (cost + egress)."
  else echo "  SKIP: bun missing — install: curl -fsSL https://bun.sh/install | bash"; fi
else
  say "gbrain — skipped (--no-gbrain)"
fi

# 5) Register the two MCP servers with each agent.
say "Register MCP servers (headroom + gbrain)"
echo "  Claude Code: defined in ./.mcp.json (auto-discovered) — nothing to do."
echo "  Cursor:      defined in ./.cursor/mcp.json — nothing to do."
if have claude; then
  claude mcp add headroom -- headroom mcp serve 2>/dev/null && echo "  claude: added headroom" || echo "  claude: headroom already present / skipped"
  [ "$WANT_GBRAIN" = "1" ] && { claude mcp add gbrain -- gbrain serve 2>/dev/null && echo "  claude: added gbrain" || echo "  claude: gbrain already present / skipped"; }
fi
if have codex; then
  codex mcp add headroom -- headroom mcp serve 2>/dev/null && echo "  codex: added headroom" || echo "  codex: skipped"
  [ "$WANT_GBRAIN" = "1" ] && { codex mcp add gbrain -- gbrain serve 2>/dev/null && echo "  codex: added gbrain" || echo "  codex: skipped"; }
else
  echo "  Codex: 'codex' CLI not found — paste .codex/config.toml's [mcp_servers.*] into ~/.codex/config.toml."
fi

say "Done"
echo "Ensure these are on PATH: \$HOME/.local/bin (headroom), \$HOME/.bun/bin (gbrain)."
echo "See AGENTS.md and docs/agent-tooling.md. Keys for gbrain go in .env (see .env.example)."
