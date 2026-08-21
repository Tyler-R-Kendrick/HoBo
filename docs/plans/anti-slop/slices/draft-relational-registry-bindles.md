---
type: Plan
title: "anti-slop slice: relational projection, registry ingest, bindles freeze"
description: "File-complete anti-slop cleanup for relational-projection-sink-contract, registry-capability-manifest-ingest-contract, and bindles-api-freeze-contract."
tags: [hobo, anti-slop, oxlint]
---

# relational projection + registry ingest + bindles freeze slice

Layer `sdlc/anti-slop-67-draft-relational-registry-bindles`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `relational-projection-sink-contract`, `registry-capability-manifest-ingest-contract`, and `bindles-api-freeze-contract` is clean.

Local `src/json.ts` parse boundary. Rename `rowShape` → `rowContract` (also the sibling document-projection fixture). Tests: relational 11; registry 10; bindles 3; document-projection 10.
