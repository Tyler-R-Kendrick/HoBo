---
type: Plan
title: "anti-slop slice: matching engine, execution host, projection rebuild, tier-two"
description: "File-complete anti-slop cleanup for matching-engine-skeleton-contract, execution-host-provider-contract, projection-rebuild-contract, and tier-two-cross-region-network-contract."
tags: [hobo, anti-slop, oxlint]
---

# matching engine + execution host + projection rebuild + tier-two slice

Layer `sdlc/anti-slop-77-draft-matching-host-projection-network`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `matching-engine-skeleton-contract`, `execution-host-provider-contract`, `projection-rebuild-contract`, and `tier-two-cross-region-network-contract` is clean.

Local `src/json.ts` parse boundary. Tests: matching 7; host 6; projection 5; tier-two 6.
