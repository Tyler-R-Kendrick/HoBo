---
type: Plan
title: "anti-slop slice: built-in policy, planner dag, policy adapters"
description: "File-complete anti-slop cleanup for built-in-policy-engine-contract, planner-dag-skeleton-contract, and policy-engine-provider-adapters-contract."
tags: [hobo, anti-slop, oxlint]
---

# built-in policy + planner dag + policy adapters slice

Layer `sdlc/anti-slop-69-draft-policy-planner-adapters`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `built-in-policy-engine-contract`, `planner-dag-skeleton-contract`, and `policy-engine-provider-adapters-contract` is clean.

Local `src/json.ts` parse boundary. Policy evaluate/request keep DecisionRequest and PolicyRuleset. Tests: policy 9; planner 4; adapters 9.
