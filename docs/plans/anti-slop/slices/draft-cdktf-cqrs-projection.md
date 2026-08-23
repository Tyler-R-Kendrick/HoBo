---
type: Plan
title: "anti-slop slice: cdktf import, cqrs aggregate, native log projection"
description: "File-complete anti-slop cleanup for iac-cdktf-import-only-contract, cqrs-command-aggregate-contract, and native-log-projection-contract."
tags: [hobo, anti-slop, oxlint]
---

# cdktf import + cqrs aggregate + native log projection slice

Layer `sdlc/anti-slop-60-draft-cdktf-cqrs-projection`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `iac-cdktf-import-only-contract`, `cqrs-command-aggregate-contract`, and `native-log-projection-contract` is clean.

Local `src/json.ts` parse boundary. Named `ResourceMappings` / `OpenTicketResult`. Native log `rowShape` renamed to `rowSchema`. Tests: cdktf 6 + `tsc`; cqrs 7 + `tsc`; projection 7.
