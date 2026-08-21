---
type: Plan
title: "anti-slop slice: packages/data"
description: "File-complete oxlint anti-slop cleanup for @hobo/data."
tags: [hobo, anti-slop, oxlint, data]
---

# anti-slop slice — `packages/data`

File-complete: every TypeScript file under `packages/data/` is
`pnpm exec oxlint --config oxlint.config.ts --deny-warnings` clean (0 findings).
Did not weaken, disable, or suppress anti-slop rules; Effect plugin stays off.

## What changed

- Named parse types `JsonValue` / `JsonObject` / `Inspectable` / `ErrorSignal` in
  `packages/data/src/json.ts` (same tag-check pattern as
  `scripts/lib/inspectable.ts` and `site/src/lib/json-inspect.ts`).
- `typeof` replaced with `Object.prototype.toString` tag checks /
  `=== undefined` (lease keys, fact types, upcasters, projection keys,
  quarantine `offendingSeq`).
- `unknown` parameters replaced with named contracts: `JsonObject` on
  `CommandEmitter.emit`, `Error | ErrorSignal` on conflict/fence predicates.
- `Record<string, unknown>` on `DataFact` became `JsonObject`.
- Remaining `as` assertions carry a `SAFETY:` comment on the preceding line.
- Durable actor host takes an `ActorLeaseJournal` port instead of casting a
  fake `SqliteJournal`.
- Tests parse order event bodies instead of asserting anonymous object views.

## Gates

- `pnpm exec oxlint --config oxlint.config.ts --deny-warnings -- packages/data`
- `pnpm --filter @hobo/data test`
- `pnpm --filter @hobo/data test:contract:consumer`
