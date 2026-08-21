---
type: Plan
title: "anti-slop slice: @hobo/storage-sqlite"
description: "File-complete anti-slop cleanup for packages/storage-sqlite."
tags: [hobo, anti-slop, oxlint]
---

# storage-sqlite slice

Layer `sdlc/anti-slop-36-storage-sqlite`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/storage-sqlite` is clean. `@hobo/storage-sqlite` `tsc --noEmit` is clean. Package tests: 49 passed.

Local `src/json.ts` is the parse boundary. Codec decode returns `JsonValue` / `DecodedPayload`. SQLite rows are `SqliteRow` (SqliteValue column maps), not `Record<string, unknown>`. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement.
