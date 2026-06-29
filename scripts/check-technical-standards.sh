#!/usr/bin/env sh
set -eu

base=""
mode="worktree"
for arg in "$@"; do
  case "$arg" in
    --staged) mode="staged" ;;
    --base=*) base=${arg#--base=} ;;
    --help|-h)
      cat <<'USAGE'
Usage: scripts/check-technical-standards.sh [--staged] [--base=<git-ref>]

Enforces HoBo's compile-time-first technical standards on changed files:
- TypeScript toolchain is declared in package metadata.
- New JavaScript-family implementation files are rejected in favor of .ts.
- Canonical agent/design docs keep the Protobuf, CUE, parse-don't-validate,
  and PACT guidance present.
USAGE
      exit 0
      ;;
  esac
done

failures=0
fail() {
  printf '%s\n' "$1" >&2
  failures=$((failures + 1))
}

require_text() {
  file=$1
  pattern=$2
  message=$3
  if ! grep -Eq "$pattern" "$file"; then
    fail "$message"
  fi
}

require_text package.json '"typescript"[[:space:]]*:' 'package.json: missing TypeScript dev dependency'
require_text package-lock.json 'node_modules/typescript' 'package-lock.json: missing locked TypeScript toolchain'
require_text AGENTS.md 'Protobuf' 'AGENTS.md: missing Protobuf agent guidance'
require_text AGENTS.md 'CUE' 'AGENTS.md: missing CUE agent guidance'
require_text AGENTS.md 'Parse, don'"'"'t validate' 'AGENTS.md: missing parse-don'
require_text AGENTS.md 'PACT' 'AGENTS.md: missing PACT agent guidance'
require_text docs/design/technical-standards.md 'Protobuf' 'technical standards: missing Protobuf guidance'
require_text docs/design/technical-standards.md 'CUE' 'technical standards: missing CUE guidance'
require_text docs/design/technical-standards.md 'Parse, don'"'"'t validate' 'technical standards: missing parse-don'
require_text docs/design/technical-standards.md 'PACT' 'technical standards: missing PACT guidance'

if [ "$mode" = "staged" ]; then
  changes=$(git diff --cached --name-status --diff-filter=ACMR)
elif [ -n "$base" ]; then
  changes=$(git diff --name-status --diff-filter=ACMR "$base...HEAD")
else
  changes=$({ git diff --name-status --diff-filter=ACMR HEAD; git ls-files --others --exclude-standard | sed 's/^/A\t/'; } | awk 'NF')
fi

printf '%s\n' "$changes" | while IFS=' 	' read -r status file rest; do
  [ -n "${status:-}" ] || continue
  case "$status" in
    R*) file=$rest ;;
    A|AM|AD) ;;
    *) continue ;;
  esac
  case "$file" in
    src/*.js|src/*.mjs|src/*.cjs|src/*/*.js|src/*/*.mjs|src/*/*.cjs|src/*/*/*.js|src/*/*/*.mjs|src/*/*/*.cjs|scripts/*.js|scripts/*.mjs|scripts/*.cjs|test/*.js|test/*.mjs|test/*.cjs|test/*/*.js|test/*/*.mjs|test/*/*.cjs)
      printf '%s\n' "$file"
      ;;
  esac
done > .git/hobo-new-js-files.tmp

if [ -s .git/hobo-new-js-files.tmp ]; then
  fail 'New JavaScript-family implementation files detected; use TypeScript (.ts) for new code or document an ADR exception:'
  sed 's/^/- /' .git/hobo-new-js-files.tmp >&2
fi
rm -f .git/hobo-new-js-files.tmp

tracked_js=$(git ls-files '*.js' '*.mjs' '*.cjs')
if [ -n "$tracked_js" ]; then
  fail 'Tracked JavaScript-family implementation files remain; convert them to TypeScript (.ts) or document an ADR exception:'
  printf '%s\n' "$tracked_js" | sed 's/^/- /' >&2
fi


if command -v npm >/dev/null 2>&1; then
  npm run --silent contracts:data-models
else
  fail 'npm is required to validate Protobuf/CUE data-model contracts'
fi

if [ "$failures" -gt 0 ]; then
  exit 1
fi

printf 'technical standards ok\n'
