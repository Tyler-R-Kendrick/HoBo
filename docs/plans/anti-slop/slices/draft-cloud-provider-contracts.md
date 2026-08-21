---
type: Plan
title: "anti-slop slice: azure, gcp, aws provider contracts"
description: "File-complete anti-slop cleanup for provider-azure-contract, provider-gcp-contract, and provider-aws-contract."
tags: [hobo, anti-slop, oxlint]
---

# azure + gcp + aws provider contract slice

Layer `sdlc/anti-slop-59-draft-cloud-provider-contracts`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `provider-azure-contract`, `provider-gcp-contract`, and `provider-aws-contract` is clean.

Local `src/json.ts` parse boundary. Declaration `Record<string, unknown>` replaced with `JsonObject` / named bags. Tests: azure 7 + `tsc`; gcp 7 + `tsc`; aws 6 + `tsc`.
