---
type: Plan
title: "anti-slop slice: artifact repo, driver dispatch, dagger, certify"
description: "File-complete anti-slop cleanup for artifact-repo-port-contract, driver-dispatch-routing-contract, build-dagger-provider-contract, and generation-certify-stage-contract."
tags: [hobo, anti-slop, oxlint]
---

# artifact repo + driver dispatch + dagger + certify slice

Layer `sdlc/anti-slop-76-draft-artifact-dispatch-dagger-certify`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `artifact-repo-port-contract`, `driver-dispatch-routing-contract`, `build-dagger-provider-contract`, and `generation-certify-stage-contract` is clean.

Local `src/json.ts` parse boundary. Tests: artifact 6; dispatch 8; dagger 6; certify 5.
