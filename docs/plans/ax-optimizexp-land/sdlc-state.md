---
type: Reference
title: "ax-optimizexp-land initiative state"
description: "Durable loop state for landing optimizexp AX reductions."
tags: [hobo, plans, sdlc, optimizexp, ax]
---

# Initiative: land optimizexp AX reductions

**Phase:** planned → dispatching  
**Slug:** `ax-optimizexp-land`  
**Opened:** 2026-07-31  
**Host:** grok  

## Goal

Ship the measured AX optimizexp reductions already validated in run `20260731-ax-review`:
setup `--help`/usage, gbrain fail-closed MCP launcher, AUTH/docs pointers, feature rewire,
and run artifacts. Single-layer PR; squash-merge (billing-red CI does not block).

## Decisions

- User chose approach **A** (brainstorm 2026-07-31): land AX only; no quiet-setup residual.
- No new draft proof this PR (tooling/docs + optimizexp harness data only).
- No Linear CLI; one-shot contract staged in this file + backlog note.
- Backend: **sequential-fallback** (work already implemented in working tree; coordinator delivers).
- Exclude `.serena/` from commits (local IDE noise).

## Kill-log (brainstorm)

- Kill: inventing a new agent doctor package — YAGNI; help + launcher enough.
- Kill: removing gbrain from MCP configs entirely — hosts still need opt-in surface; fail-closed is safer.
- Survive: shared launcher pattern (mirrors serena).

## Plan (approved via user choice A)

| Layer | Branch | Deliverable | Gates |
|---|---|---|---|
| 01 (only) | `sdlc/ax-optimizexp-land-01-setup-help-gbrain` | scripts + MCP + docs + optimizexp AX artifacts | `bash scripts/setup-agent-tools.sh --help`; `bash scripts/agent-mcp-gbrain.sh` exit 1 without key; `pnpm run skills:mirror-check`; `pnpm run test:file .optimizexp/features/agent-tooling-setup/test/agent-tooling-setup.bindings.test.ts`; `pnpm agent:check -- --staged` |

## One-shot issue contract

### Issue: AX-01 land setup help + gbrain fail-closed

**Why:** Agent operators and coding agents need a zero-key progressive setup path with fail-closed optional key tools.

**Scope in:**
- `scripts/setup-agent-tools.sh`, `scripts/agent-mcp-gbrain.sh`
- `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`
- `AUTH.md`, `AGENTS.md`, `docs/agent-tooling.md`, `.env.example`
- `.optimizexp/features/agent-tooling-setup/**`, `.optimizexp/runs/20260731-ax-review/**`, bus entries `*400*`

**Scope out:** quiet/idempotent full install (residual L); new draft proofs; Linear wiring.

**Acceptance:**
1. `bash scripts/setup-agent-tools.sh --help` → exit 0, prints `--no-gbrain` and `AUTH.md`
2. `bash scripts/agent-mcp-gbrain.sh` without binary/key → exit 1, mentions AUTH.md
3. MCP configs reference `scripts/agent-mcp-gbrain.sh`
4. Bindings test green; skills mirror OK
5. Run summary documents plateau

**DoD:** PR reviewed (rubber-duck + adversarial), comments cleared, squash-merged (or billing exception documented).

## Stack topology

Single-layer (normal PR acceptable; not multi-phase product stack).

## Dispatch

| Issue | Backend | Branch | PR | Status |
|---|---|---|---|---|
| AX-01 | sequential-fallback | `sdlc/ax-optimizexp-land-01-setup-help-gbrain` | TBD | in progress |
