---
type: Plan
title: "anti-slop slice: portability lane, usage permissions, convex adapter"
description: "File-complete anti-slop cleanup for s4-08-portability-conformance-lane-contract, s1-17-usage-permissions-coverage-poc, and convex-swaghaus-deploy-adapter."
tags: [hobo, anti-slop, oxlint]
---

# portability lane + usage permissions + convex adapter slice

Layer `sdlc/anti-slop-57-draft-portability-usage-convex`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `s4-08-portability-conformance-lane-contract`, `s1-17-usage-permissions-coverage-poc`, and `convex-swaghaus-deploy-adapter` is clean.

Local `src/json.ts` parse boundary. Named `BoundaryLintResult` / `DeclaredResourceAnalysis` / `LineColumn` replace anonymous return dictionaries. Tests: s4-08 10; s1-17 16 + `tsc`; convex 15.
