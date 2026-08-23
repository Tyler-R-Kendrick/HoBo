---
type: Plan
title: "anti-slop slice: camp eventstore, internal ca, cost guard, session revocation"
description: "File-complete anti-slop cleanup for camp-eventstore-runtime-port-contract, internal-ca-private-acme-contract, observability-cost-guard-contract, and session-revocation-contract."
tags: [hobo, anti-slop, oxlint]
---

# camp eventstore + internal ca + cost guard + session revocation slice

Layer `sdlc/anti-slop-80-draft-eventstore-ca-cost-revocation`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `camp-eventstore-runtime-port-contract`, `internal-ca-private-acme-contract`, `observability-cost-guard-contract`, and `session-revocation-contract` is clean.

Local `src/json.ts` parse boundary. Tests: eventstore 6; ca 4; cost-guard 6; session 5.
