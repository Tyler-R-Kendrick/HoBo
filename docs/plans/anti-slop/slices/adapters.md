---
type: Plan
title: "anti-slop slice: adapters"
description: "File-complete anti-slop cleanup for remaining @hobo/adapter-* packages."
tags: [hobo, anti-slop, oxlint]
---

# adapters slice

Layer `sdlc/anti-slop-45-adapters`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/adapters` is clean. Package `tsc -p tsconfig.json --noEmit` is clean on drizzle, better-auth, openbao, and hono.

Tests: drizzle 42, better-auth 95, openbao 41, hono 4.

Local `src/json.ts` parse boundary in each package. Shape identifiers renamed to domain names (`DataMigrationPlanRecord`, `refuseLocator`). Remaining `as` assertions carry a `SAFETY:` comment on the containing statement.
