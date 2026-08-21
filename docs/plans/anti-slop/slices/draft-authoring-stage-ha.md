---
type: Plan
title: "anti-slop slice: provider authoring, stage-gate, control-plane HA"
description: "File-complete anti-slop cleanup for provider-authoring-contract, s1-stage-gate, and s6-02-control-plane-ha-contract."
tags: [hobo, anti-slop, oxlint]
---

# provider authoring + stage-gate + control-plane HA slice

Layer `sdlc/anti-slop-65-draft-authoring-stage-ha`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `provider-authoring-contract`, `s1-stage-gate`, and `s6-02-control-plane-ha-contract` is clean.

Local `src/json.ts` parse boundary. Drop anonymous return types on authoring helpers. Tests: authoring 8 + `tsc`; stage-gate 9; HA 12.
