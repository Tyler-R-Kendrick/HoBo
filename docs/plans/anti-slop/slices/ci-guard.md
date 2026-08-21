---
type: Plan
title: "anti-slop slice: @hobo/ci-guard"
description: "File-complete anti-slop cleanup for packages/ci-guard."
tags: [hobo, anti-slop, oxlint, ci-guard]
---

# anti-slop slice — `@hobo/ci-guard`

`pnpm exec oxlint --config oxlint.config.ts --deny-warnings -- packages/ci-guard`
is **0 warnings / 0 errors** on 14 TypeScript files.

## What changed

Untrusted JSON now crosses a named parse boundary instead of `unknown` /
`typeof` / `Record<string, unknown>`:

- `packages/ci-guard/src/json.ts` — `JsonValue` / `JsonObject` plus tag checks
  (`Object.prototype.toString`) matching `scripts/lib/inspectable.ts`.
- `parseCiFabricContract(input: JsonValue | undefined)` decodes at the I/O
  boundary; a post-check `asserts` predicate yields `CiFabricContract` without
  chained `as unknown as` assertions.
- Contract overrides merge as named nested records (no generic object walk,
  no runtime `typeof`, no open `Record<string, unknown>` dictionaries).
- Fixture JSONL events, simulation results, CLI flags, and the token-broker
  pact parse as named owner types.
- `validateContractShape` renamed to `validateDeclaredContract` (`shape` is
  banned in symbol names). Empty conditional spreads on simulation results
  became two object literals.

Package docs (`README.md`, `ARCHITECTURE.md`) record the `JsonValue` parse
boundary. `docs/plans/anti-slop/sdlc-state.md` is owned by other agents and
was not edited.

## Gates

- `pnpm exec oxlint --config oxlint.config.ts --deny-warnings -- packages/ci-guard`
- `pnpm --filter @hobo/ci-guard test`
- `pnpm --filter @hobo/ci-guard typecheck`
- `pnpm --filter @hobo/ci-guard lint`
