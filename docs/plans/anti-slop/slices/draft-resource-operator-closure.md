---
type: Plan
title: "anti-slop slice: resource definition, operator ports, closure lowering"
description: "File-complete anti-slop cleanup for resource-definition-driver-contract, operator-integration-ports-contract, and closure-builder-manifest-lowering-contract."
tags: [hobo, anti-slop, oxlint]
---

# resource definition + operator ports + closure lowering slice

Layer `sdlc/anti-slop-71-draft-resource-operator-closure`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `resource-definition-driver-contract`, `operator-integration-ports-contract`, and `closure-builder-manifest-lowering-contract` is clean.

Local `src/json.ts` parse boundary. Driver state is JsonValue. Closure sort/strip helpers stay generic. Tests: resource 10; operator 6; closure 8 + tsc.
