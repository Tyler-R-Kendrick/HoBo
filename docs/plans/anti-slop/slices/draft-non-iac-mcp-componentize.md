---
type: Plan
title: "anti-slop slice: non-iac adapters, mcp server, componentize"
description: "File-complete anti-slop cleanup for non-iac-driver-adapters-contract, hobo-mcp-server-contract, and hobo-componentize."
tags: [hobo, anti-slop, oxlint]
---

# non-iac adapters + mcp server + componentize slice

Layer `sdlc/anti-slop-68-draft-non-iac-mcp-componentize`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `non-iac-driver-adapters-contract`, `hobo-mcp-server-contract`, and `hobo-componentize` is clean.

Local `src/json.ts` parse boundary. Tests: non-iac 11; mcp 12; componentize 6.
