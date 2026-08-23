---
type: Plan
title: "anti-slop slice: mid-size technical proofs"
description: "File-complete anti-slop cleanup for pact-contract-harness, deterministic-replay-engine, and hobo-policy-ir-contract."
tags: [hobo, anti-slop, oxlint]
---

# mid-size technical-proofs slice

Layer `sdlc/anti-slop-49-draft-technical-mid`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `pact-contract-harness`, `deterministic-replay-engine`, and `hobo-policy-ir-contract` is clean.

Local `src/json.ts` parse boundary. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Domain objects that are not JSON index signatures clone through `cloneAsJson` at parse/hash/canonicalize helpers. Tests: pact-contract-harness 16, deterministic-replay-engine 12, hobo-policy-ir-contract 8 plus `tsc --noEmit`.
