#!/usr/bin/env bash
# Set up agent tooling in layers:
#   1. common, harness-agnostic runtimes (Serena, headroom, SkillOpt, optional gbrain)
#   2. selected supported-agent shims (Claude Code, Cursor, Codex, Copilot)
#
# Examples:
#   bash scripts/setup-agent-tools.sh                       # common + all supported shims
#   bash scripts/setup-agent-tools.sh --common-only         # devcontainer/default safe layer
#   bash scripts/setup-agent-tools.sh --agent codex         # common + Codex shims only
#   bash scripts/setup-agent-tools.sh --agents codex,cursor # common + selected shims
#   bash scripts/setup-agent-tools.sh --no-gbrain           # skip key/egress memory tool
#   bash scripts/setup-agent-tools.sh --no-skillopt         # skip microsoft/SkillOpt install
set -uo pipefail
cd "$(dirname "$0")/.."

WANT_GBRAIN=1
WANT_SKILLOPT=1
COMMON_ONLY=0
AGENT_FILTER="claude-code,cursor,codex,copilot"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-gbrain) WANT_GBRAIN=0 ;;
    --no-skillopt) WANT_SKILLOPT=0 ;;
    --common-only) COMMON_ONLY=1; AGENT_FILTER="" ;;
    --agent|--agents)
      shift
      [ "$#" -gt 0 ] || { echo "missing value for $1" >&2; exit 2; }
      AGENT_FILTER="$1"
      ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
want_agent() { case ",$AGENT_FILTER," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
# `skills`/`npx`-based tools choke on a tsx-injecting NODE_OPTIONS; strip it.
NPX() { env -u NODE_OPTIONS npx "$@"; }

say "Probing runtimes"
for c in node npx python3 pip3 uv serena headroom skillopt-train skillopt-sleep bun claude codex copilot; do
  if have "$c"; then echo "  ok   $c"; else echo "  MISS $c"; fi
done

# Common layer: agent/harness-agnostic binaries and shared repo launchers.
say "Serena (oraios/serena) -> uv tool + shared MCP wrapper"
SERENA_BIN="$(command -v serena || true)"
if have uv; then
  uv tool install -p 3.13 serena-agent \
    && echo "  installed ($(${SERENA_BIN:-$HOME/.local/bin/serena} --version 2>/dev/null || echo '?'))" || echo "  FAILED"
  SERENA_BIN="$(command -v serena || printf '%s/.local/bin/serena' "$HOME")"
  "$SERENA_BIN" init 2>/dev/null && echo "  initialized" || echo "  init skipped / already initialized"
elif have python3; then
  python3 -m pip install --user uv 2>/dev/null \
    || python3 -m pip install --user --break-system-packages uv
  "$HOME/.local/bin/uv" tool install -p 3.13 serena-agent \
    && echo "  installed ($(${SERENA_BIN:-$HOME/.local/bin/serena} --version 2>/dev/null || echo '?'))" || echo "  FAILED"
  SERENA_BIN="$(command -v serena || printf '%s/.local/bin/serena' "$HOME")"
  "$SERENA_BIN" init 2>/dev/null && echo "  initialized" || echo "  init skipped / already initialized"
else echo "  SKIP: uv/python3 missing"; fi

say "headroom (chopratejas/headroom) -> pip + MCP server"
if have python3; then
  python3 -m pip install --user "headroom-ai[mcp]" 2>/dev/null \
    || python3 -m pip install --user --break-system-packages "headroom-ai[mcp]" \
    && echo "  installed ($(headroom --version 2>/dev/null || echo '?'))" || echo "  FAILED"
else echo "  SKIP: python3 missing"; fi

if [ "$WANT_SKILLOPT" = "1" ]; then
  say "SkillOpt (microsoft/SkillOpt) -> install CLI/runtime"
  SKILLOPT_SPEC="${SKILLOPT_SPEC:-git+https://github.com/microsoft/SkillOpt.git}"
  if have python3; then
    python3 -m pip install --user "$SKILLOPT_SPEC" 2>/dev/null \
      || python3 -m pip install --user --break-system-packages "$SKILLOPT_SPEC" \
      && echo "  installed skillopt" || echo "  FAILED"
    skillopt-train --help >/dev/null 2>&1 && echo "  verified skillopt-train" || echo "  skillopt-train not on PATH; add $HOME/.local/bin"
    skillopt-sleep --help >/dev/null 2>&1 && echo "  verified skillopt-sleep" || echo "  skillopt-sleep not on PATH; add $HOME/.local/bin"
  else echo "  SKIP: python3 missing"; fi
else
  say "SkillOpt — skipped (--no-skillopt)"
fi

if [ "$WANT_GBRAIN" = "1" ]; then
  say "gbrain (garrytan/gbrain) -> bun install"
  if have bun; then
    bun install -g github:garrytan/gbrain && echo "  installed ($(gbrain --version 2>/dev/null || echo '?'))" || echo "  FAILED"
    echo "  NEXT (manual): set OPENAI_API_KEY|ZEROENTROPY_API_KEY|VOYAGE_API_KEY, then 'gbrain init --pglite'."
    echo "  NOTE: gbrain sends embedding/query text to that provider (cost + egress)."
  else echo "  SKIP: bun missing — install Bun first or rerun with --no-gbrain"; fi
else
  say "gbrain — skipped (--no-gbrain)"
fi

say "Shared MCP config"
echo "  Claude Code: ./.mcp.json (auto-discovered)."
echo "  Cursor:      ./.cursor/mcp.json."
echo "  Codex:       copy ./.codex/config.toml into ~/.codex/config.toml or use codex mcp add."

if [ "$COMMON_ONLY" = "1" ]; then
  say "Agent-specific setup skipped (--common-only)"
  echo "  Next: rerun with --agent claude-code|cursor|codex|copilot when you know which client to configure."
  say "Done"
  echo "Ensure these are on PATH: $HOME/.local/bin (headroom/uv/serena/skillopt), $HOME/.bun/bin (gbrain)."
  exit 0
fi

# Agent-specific layer: only for the supported agents selected by --agent/--agents.
say "skills CLI installs -> selected Claude Code/Cursor/Codex skill dirs"
if have npx; then
  for spec in "shadcn/improve" "DietrichGebert/ponytail" "mattpocock/skills"; do
    for ag in claude-code cursor codex; do
      want_agent "$ag" || continue
      NPX --yes skills add "$spec" --project --copy -a "$ag" -s '*' -y \
        && echo "  $spec installed for $ag" || echo "  $spec FAILED for $ag"
    done
  done
  echo "  NEXT (optional): run /setup-matt-pocock-skills in your agent for issue-tracker/domain-doc layout."
else echo "  SKIP: npx missing"; fi

say "caveman (JuliusBrussee/caveman) -> selected repo rule files"
if have npx; then
  CAVEMAN_ARGS=()
  want_agent claude-code && CAVEMAN_ARGS+=(--only claude)
  want_agent codex && CAVEMAN_ARGS+=(--only codex)
  want_agent cursor && CAVEMAN_ARGS+=(--only cursor)
  if [ "${#CAVEMAN_ARGS[@]}" -gt 0 ]; then
    NPX -y "github:JuliusBrussee/caveman" "${CAVEMAN_ARGS[@]}" --with-init --no-hooks \
      && echo "  installed" || echo "  FAILED"
    rm -rf .windsurf .clinerules .opencode; rm -f .github/copilot-instructions.md; rmdir .github 2>/dev/null || true
  else echo "  SKIP: no selected caveman-capable agent"; fi
else echo "  SKIP: npx missing"; fi

say "Register MCP servers in selected CLIs when present"
if want_agent claude-code && have claude; then
  claude mcp add serena -- bash scripts/agent-mcp-serena.sh 2>/dev/null && echo "  claude: added serena" || echo "  claude: serena already present / skipped"
  claude mcp add headroom -- headroom mcp serve 2>/dev/null && echo "  claude: added headroom" || echo "  claude: headroom already present / skipped"
  [ "$WANT_GBRAIN" = "1" ] && { claude mcp add gbrain -- gbrain serve 2>/dev/null && echo "  claude: added gbrain" || echo "  claude: gbrain already present / skipped"; }
fi
if want_agent codex; then
  if have codex; then
    codex mcp add serena -- bash scripts/agent-mcp-serena.sh 2>/dev/null && echo "  codex: added serena" || echo "  codex: serena skipped"
    codex mcp add headroom -- headroom mcp serve 2>/dev/null && echo "  codex: added headroom" || echo "  codex: skipped"
    [ "$WANT_GBRAIN" = "1" ] && { codex mcp add gbrain -- gbrain serve 2>/dev/null && echo "  codex: added gbrain" || echo "  codex: skipped"; }
  else
    echo "  Codex: CLI not found — use .codex/config.toml as the progressive setup reference."
  fi
fi

say "superpowers (obra/Superpowers) -> selected plugin marketplaces"
for pair in "claude-code:claude" "codex:codex" "copilot:copilot"; do
  ag="${pair%%:*}"; cli="${pair##*:}"
  want_agent "$ag" || continue
  if have "$cli"; then
    "$cli" plugin marketplace add obra/superpowers-marketplace 2>/dev/null \
      && "$cli" plugin install superpowers@superpowers-marketplace 2>/dev/null \
      && echo "  $cli: installed superpowers" || echo "  $cli: skipped / already present"
  else echo "  $cli: CLI not found — install superpowers via its /plugin marketplace when available."; fi
done
echo "  NOTE: superpowers skills load at SESSION START — open a fresh session to use them."

say "Done"
echo "Ensure these are on PATH: $HOME/.local/bin (headroom/uv/serena/skillopt), $HOME/.bun/bin (gbrain)."
echo "See AGENTS.md and docs/agent-tooling.md. Keys for gbrain/SkillOpt live runs go in .env (see .env.example)."
