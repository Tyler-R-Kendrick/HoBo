---
type: Plan
title: "anti-slop slice: packages/manifest-plan"
description: "File-complete oxlint anti-slop cleanup for @hobo/manifest-plan."
tags: [hobo, anti-slop, oxlint, manifest-plan]
---

# anti-slop slice — `packages/manifest-plan`

Package taken to **zero** oxlint anti-slop findings (`oxlint --config oxlint.config.ts --deny-warnings`).

## What changed

- Parse boundary takes named `PlanParseInput` / `PlanParseObject` instead of `unknown` and `Record<string, unknown>`.
- JSON contracts are `JsonValue` / `JsonObject`; `PlanParameterValue` aliases `JsonValue`.
- Runtime kind checks use `Object.prototype.toString.call` (plus `instanceof` only to keep boxed primitives refused).
- Optional fields are assigned on a draft object rather than conditional empty `{}` spreads.
- Remaining `as` assertions are the branded `ResourcePlan` / `DeploymentPlan` constructors, each preceded by a `SAFETY:` comment.
- Tests use fixture interfaces, parse `JSON.parse` into named types, and drop `typeof` / unguarded `as`.

## Files

- `packages/manifest-plan/src/index.ts`
- `packages/manifest-plan/test/canonical-form.test.ts`
- `packages/manifest-plan/test/conformance.test.ts`
- `packages/manifest-plan/test/pact.test.ts`
- `packages/manifest-plan/test/round-trip.test.ts`
- `packages/manifest-plan/README.md`

## Gates

- `pnpm exec oxlint --config oxlint.config.ts --deny-warnings -- packages/manifest-plan`
- `pnpm --filter @hobo/manifest-plan test`
