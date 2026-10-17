#!/usr/bin/env sh
# Point git at this repository's hooks (.githooks) when nothing else has.
#
# The root `prepare` script does this on install, but an install that runs no
# lifecycle scripts, or a worktree sharing another checkout's node_modules,
# never runs it, and `git commit` is then ungated. Each agent's session-start
# hook calls this script (.claude/settings.json, .codex/hooks.json,
# .cursor/hooks.json, .github/hooks/git-hooks-path.json).
#
# It writes core.hooksPath into the common git config, which every worktree
# shares, and only when no value is in effect, so it never replaces one
# somebody chose. It acts only on this checkout's own repository: a copy with
# no .git of its own, inside some other repository, leaves that one alone. It
# prints nothing and always exits 0, so a session never fails because of it.
# HOBO_SKIP_HOOKS or CI skips it, as they skip scripts/install-hooks.mts.
cd "$(dirname "$0")/.." 2>/dev/null || exit 0
[ -z "${HOBO_SKIP_HOOKS:-}${CI:-}" ] || exit 0
[ -d .githooks ] || exit 0
[ -e .git ] || exit 0
top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ "$(cd "$top" 2>/dev/null && pwd -P)" = "$(pwd -P)" ] || exit 0
git config --get core.hooksPath >/dev/null 2>&1 && exit 0
common=$(git rev-parse --git-common-dir 2>/dev/null) || exit 0
[ -n "$common" ] || exit 0
git config --file "$common/config" core.hooksPath .githooks >/dev/null 2>&1
exit 0
