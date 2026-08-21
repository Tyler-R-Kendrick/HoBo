---
type: Plan
title: "anti-slop slice: identity"
description: "File-complete anti-slop cleanup for @hobo/identity."
tags: [hobo, anti-slop, oxlint]
---

# identity slice

Layer `sdlc/anti-slop-44-identity`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern packages/identity` is clean. Package `tsc -p tsconfig.json --noEmit` is clean. Tests: 135 passed.

Local `src/json.ts` parse boundary. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Named result types replace anonymous object returns. Event envelopes clone domain payloads through `asJsonObject` at the JSON document boundary.
