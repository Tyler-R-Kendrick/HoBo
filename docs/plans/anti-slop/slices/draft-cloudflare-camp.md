---
type: Plan
title: "anti-slop slice: cloudflare contract + camp mapping sugar"
description: "File-complete anti-slop cleanup for provider-cloudflare-contract and camp-mapping-sugar-compiler."
tags: [hobo, anti-slop, oxlint]
---

# cloudflare contract + camp mapping sugar slice

Layer `sdlc/anti-slop-54-draft-cloudflare-camp`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `provider-cloudflare-contract` and `camp-mapping-sugar-compiler` is clean.

Local `src/json.ts` parse boundary. Camp mapping `shape*` symbols renamed to `kind*` / `matchKey`. Cloudflare `Record<string, unknown>` replaced with named bags (`JsonObject`/`JsonBag`/`StringBag`/`ServiceMatrix`). Tests: cloudflare 7 + `tsc -p tsconfig.types.json`, camp-mapping 7.
