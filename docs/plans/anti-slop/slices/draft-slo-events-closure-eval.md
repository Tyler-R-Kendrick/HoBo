---
type: Plan
title: "anti-slop slice: slo, control-plane events, closure v1, live eval"
description: "File-complete anti-slop cleanup for slo-as-code-contract, control-plane-event-schema-contract, closure-builder-v1-finalization-contract, and openinference-live-eval-stream-contract."
tags: [hobo, anti-slop, oxlint]
---

# slo + control-plane events + closure v1 + live eval slice

Layer `sdlc/anti-slop-72-draft-slo-events-closure-eval`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `slo-as-code-contract`, `control-plane-event-schema-contract`, `closure-builder-v1-finalization-contract`, and `openinference-live-eval-stream-contract` is clean.

Local `src/json.ts` parse boundary. Tests: slo 9; events 10; closure-v1 4; live-eval 7.
