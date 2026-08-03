---
type: Reference
title: "Try HoBo browser WIT delivery state"
description: "Durable SDLC state for the repository-backed Examples console and browser-local WIT Environment Station."
tags: [hobo, plans, sdlc, site, examples, wit]
---

# Initiative: Try HoBo browser WIT

**Phase:** review  
**Slug:** `try-hobo-browser-wit`  
**Opened:** 2026-08-02  
**Host:** Codex

## Goal

Ship the repository-backed `/examples/` console with sparse policy planning and
a real browser-local WebAssembly Component Model guest, while keeping remote
provider bootstrap fail-closed on the static site.

## Delivery

- Branch: `feat/try-hobo-browser-wit`
- PR: [#1008](https://github.com/Tyler-R-Kendrick/HoBo/pull/1008)
- Stack: single layer
- Unrelated local Headroom, OptimizeXP, `.venv`, and submodule cache changes are
  preserved outside this delivery.

## Acceptance

- Repository examples and sparse policies are parsed from tracked source.
- The generated WIT guest executes every exposed example action in component-local state.
- Generated browser assets are digest-verified before execution.
- A sandboxed Environment Station boots and completes a user-visible action.
- Site tests, typecheck, clean component generation, build, and PR-base gates pass.

## Finish evidence

- Fresh `componentize-js` build: passed outside the restricted agent sandbox in
  15 seconds; the same generated runtime then produced a verified cache hit.
- Static site build: 139 pages generated with the verified runtime.
- Playwright: the counter component reached ready, incremented to 1, kept a
  script-only sandbox, exposed no raw blob link, and emitted no browser failures.
- `pnpm agent:check -- --staged`: 17 impact-selected checks passed in 19 seconds.
