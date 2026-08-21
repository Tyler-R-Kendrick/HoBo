---
type: Plan
title: "anti-slop slice: connectivity policy, interconnect, flags, domain validation"
description: "File-complete anti-slop cleanup for connectivity-policy-enforcement-contract, tier-three-private-interconnect-contract, flag-event-contract, and domain-validation-gate-contract."
tags: [hobo, anti-slop, oxlint]
---

# connectivity policy + interconnect + flags + domain validation slice

Layer `sdlc/anti-slop-75-draft-connectivity-interconnect-flags`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `connectivity-policy-enforcement-contract`, `tier-three-private-interconnect-contract`, `flag-event-contract`, and `domain-validation-gate-contract` is clean.

Local `src/json.ts` parse boundary. Tests: connectivity 8; interconnect 7; flags 9; domain 7.
