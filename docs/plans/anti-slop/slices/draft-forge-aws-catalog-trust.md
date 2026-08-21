---
type: Plan
title: "anti-slop slice: forge ingestion, aws full catalog, artifact trust"
description: "File-complete anti-slop cleanup for s5-03-forge-ingestion-contract, provider-aws-full-capability-catalog-contract, and componentize-artifact-trust-contract."
tags: [hobo, anti-slop, oxlint]
---

# forge ingestion + aws full catalog + artifact trust slice

Layer `sdlc/anti-slop-62-draft-forge-aws-catalog-trust`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `s5-03-forge-ingestion-contract`, `provider-aws-full-capability-catalog-contract`, and `componentize-artifact-trust-contract` is clean.

Local `src/json.ts` parse boundary. Generated forge candidate templates keep `unknown`/`typeof`. Tests: forge 7; aws catalog 10 + `tsc`; artifact-trust 1.
