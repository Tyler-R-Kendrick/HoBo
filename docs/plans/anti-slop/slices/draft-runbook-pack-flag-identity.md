---
type: Plan
title: "anti-slop slice: runbook, resource pack, auth flag readset, identity event"
description: "File-complete anti-slop cleanup for runbook-contract, resource-pack-distribution-contract, auth-flag-readset-contract, and identity-event-contract."
tags: [hobo, anti-slop, oxlint]
---

# runbook + resource pack + auth flag readset + identity event slice

Layer `sdlc/anti-slop-82-draft-runbook-pack-flag-identity`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `runbook-contract`, `resource-pack-distribution-contract`, `auth-flag-readset-contract`, and `identity-event-contract` is clean.

Local `src/json.ts` parse boundary. Tests: runbook 9; pack 11; auth-flag 6; identity-event 4.
