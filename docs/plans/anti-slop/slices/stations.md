---
type: Plan
title: "anti-slop slice: @hobo/stations"
description: "File-complete anti-slop cleanup for packages/stations."
tags: [hobo, anti-slop, oxlint]
---

# stations slice

Layer `sdlc/anti-slop-35-stations`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/stations` is clean. `@hobo/stations` `tsc --noEmit` is clean. Package tests: 91 passed.

Local `src/json.ts` is the parse boundary. `parseStationEvent` / `parseRail` reconstruct domain records at the JSONL/event fold. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement.
