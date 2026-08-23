---
type: Plan
title: "anti-slop slice: container fallback, wrpc link, observability drift"
description: "File-complete anti-slop cleanup for container-fallback-wiring-parity-contract, wrpc-link-layer-contract, and s6-05-observability-drift-loop-contract."
tags: [hobo, anti-slop, oxlint]
---

# container fallback + wrpc link + observability drift slice

Layer `sdlc/anti-slop-61-draft-container-wrpc-drift`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `container-fallback-wiring-parity-contract`, `wrpc-link-layer-contract`, and `s6-05-observability-drift-loop-contract` is clean.

Local `src/json.ts` parse boundary. Provider handler returns `JsonValue | void`. Tests: container 10; wrpc 12; drift 14.
