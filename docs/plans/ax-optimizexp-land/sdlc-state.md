---
type: Reference
title: "ax-optimizexp-land initiative state"
description: "Durable loop state for landing optimizexp AX reductions."
tags: [hobo, plans, sdlc, optimizexp, ax]
---

# Initiative: land optimizexp AX reductions

**Phase:** closed  
**Slug:** `ax-optimizexp-land`  
**Opened:** 2026-07-31  
**Closed:** 2026-07-31  
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

## Delivered PRs

| PR | Title | Result | Notes |
|---|---|---|---|
| [#968](https://github.com/Tyler-R-Kendrick/HoBo/pull/968) | feat(agents): AX setup help + gbrain fail-closed launcher | squash-merged `c37cf984` | CI jobs empty-step billing failure; documented + merged |

## Stack topology

Single-layer (normal PR). Branch: `sdlc/ax-optimizexp-land-01-setup-help-gbrain`.

## Dispatch

| Issue | Backend | Branch | PR | Status |
|---|---|---|---|---|
| AX-01 | sequential-fallback | `sdlc/ax-optimizexp-land-01-setup-help-gbrain` | #968 | **Done** (merged) |

## Billing-budget exceptions

- **2026-07-31 PR #968:** jobs failed with empty steps; annotation  
  "The job was not started because recent account payments have failed or your spending limit
  needs to be increased." Local acceptance green. Squash-merged under exception.
