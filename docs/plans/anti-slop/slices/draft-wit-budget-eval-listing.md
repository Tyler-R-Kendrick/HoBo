---
type: Plan
title: "anti-slop slice: wit conformance, budget quota, eval methodology, listing yank"
description: "File-complete anti-slop cleanup for s5-02-wit-interface-conformance-coverage, budget-quota-policy-contract, generation-eval-methodology-spike, and listing-lifecycle-yank-contract."
tags: [hobo, anti-slop, oxlint]
---

# wit conformance + budget quota + eval methodology + listing yank slice

Layer `sdlc/anti-slop-81-draft-wit-budget-eval-listing`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `s5-02-wit-interface-conformance-coverage`, `budget-quota-policy-contract`, `generation-eval-methodology-spike`, and `listing-lifecycle-yank-contract` is clean.

Local `src/json.ts` parse boundary. Tests: wit 6; budget 15; eval 4; listing 7.
