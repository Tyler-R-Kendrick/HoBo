---
type: Plan
title: "anti-slop slice: meta-cloud broker, training engine, auth authoring"
description: "File-complete anti-slop cleanup for meta-cloud-broker-artifact-contract, training-engine-port-contract, and hobo-auth-authoring-surface."
tags: [hobo, anti-slop, oxlint]
---

# meta-cloud broker + training engine + auth authoring slice

Layer `sdlc/anti-slop-66-draft-broker-training-auth`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `meta-cloud-broker-artifact-contract`, `training-engine-port-contract`, and `hobo-auth-authoring-surface` is clean.

Local `src/json.ts` parse boundary. Rename claim-contract helpers off `shape`. Tests: broker 5; training-engine 6; auth-authoring 6.
