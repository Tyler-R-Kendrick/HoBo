---
type: Plan
title: "anti-slop slice: planner dag, local loop, closure builder"
description: "File-complete anti-slop cleanup for s2-04-planner-deployment-plan-dag-poc, hobo-612-dev-local-loop-poc, and closure-builder-resource-handles-contract."
tags: [hobo, anti-slop, oxlint]
---

# planner dag + local loop + closure builder slice

Layer `sdlc/anti-slop-58-draft-planner-loop-closure`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `s2-04-planner-deployment-plan-dag-poc`, `hobo-612-dev-local-loop-poc`, and `closure-builder-resource-handles-contract` is clean.

Local `src/json.ts` parse boundary. Named capability-request maps and `DependencyRef` host type. Tests: planner 4; local-loop 14; closure 8 + `tsc`.
