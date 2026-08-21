---
type: Plan
title: "anti-slop slice: raw-driver, contract-ir, postgres ports"
description: "File-complete anti-slop cleanup for raw-driver-escape-hatch-contract, hobo-contract-ir, and runtime-postgres-ports."
tags: [hobo, anti-slop, oxlint]
---

# raw-driver + contract-ir + postgres ports slice

Layer `sdlc/anti-slop-53-draft-escape-ir-postgres`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `raw-driver-escape-hatch-contract`, `hobo-contract-ir`, and `runtime-postgres-ports` is clean.

Local `src/json.ts` parse boundary. `RequiredShape` renamed to `RequiredRecord`. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Tests: raw-driver 4 + `tsc`, contract-ir 9, runtime-postgres-ports 3.
