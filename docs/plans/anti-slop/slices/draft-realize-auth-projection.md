---
type: Plan
title: "anti-slop slice: realize emission, auth consumer, document projection"
description: "File-complete anti-slop cleanup for hobo-realize-emission-contract, hobo-auth-consumer-contract, and document-projection-sink-contract."
tags: [hobo, anti-slop, oxlint]
---

# realize emission + auth consumer + document projection slice

Layer `sdlc/anti-slop-64-draft-realize-auth-projection`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `hobo-realize-emission-contract`, `hobo-auth-consumer-contract`, and `document-projection-sink-contract` is clean.

Local `src/json.ts` parse boundary. `visit()` walks arrays before `isJsonObject` (arrays are not JSON objects). Document `rowShape` stays a sibling relational-projection field via computed key. Tests: realize 6; auth-consumer 7; document-projection 10.
