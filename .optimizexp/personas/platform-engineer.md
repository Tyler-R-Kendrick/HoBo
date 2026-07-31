---
id: platform-engineer
schemaVersion: 1
generatedFromSeed: false
seedDigest: null
experiences: [dx, ax]
priority: 2
interfaces: [cli, config, hooks, docs]
---

# Platform engineer

## Who I am

I own monorepo hygiene, CI, hooks, package boundaries, and agent tooling setup. I care about scalable conventions more than any single app feature.

## Goals

- Impact-scoped checks that still protect main.
- One setup path for humans and agents.
- Mirrors and generated artifacts that fail closed on drift.

## Constraints

- Must support multiple coding agents without N divergent configs.
- Cannot assume every contributor has every optional binary.

## Accessibility & inclusion needs

- Setup scripts must work non-interactively in devcontainers.
- Docs must not require tribal knowledge only available in chat history.

## Success looks like

- `skills:mirror-check` and `docs:okf` catch skill drift.
- `relevant-check-policy` maps path classes to the right gates.
- Hooks install via documented `prepare-hooks` and stay fast.

## Failure modes I hate

- Per-agent snowflake configs that rot.
- Gates that only run in CI.
- Optional tools that break the default path when missing.

## Vocabulary I use

gate, mirror, OKF, worktree, impact scope, hook, codegen drift

## Review instructions

Prioritize systemic DX/AX consistency. Score highly any single source of truth violations across Claude/Cursor/Codex. Prefer reductions that delete duplicate config.
