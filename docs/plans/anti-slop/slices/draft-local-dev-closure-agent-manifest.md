---
type: Plan
title: "anti-slop slice: local-dev authoring, closure public api, durable agent, manifest"
description: "File-complete anti-slop cleanup for local-dev-test-authoring-contract, closure-builder-public-api-contract, durable-agent-primitive-contract, and hobo-manifest-contract."
tags: [hobo, anti-slop, oxlint]
---

# local-dev authoring + closure public api + durable agent + manifest slice

Layer `sdlc/anti-slop-78-draft-local-dev-closure-agent-manifest`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `local-dev-test-authoring-contract`, `closure-builder-public-api-contract`, `durable-agent-primitive-contract`, and `hobo-manifest-contract` is clean.

Local `src/json.ts` parse boundary. Tests: local-dev 6; closure-api 5; durable-agent 4; manifest 7.
