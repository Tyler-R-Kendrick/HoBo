---
type: Plan
title: "anti-slop slice: protobuf cue codegen, observed promotion, capability manifest/spec"
description: "File-complete anti-slop cleanup for s0-04-protobuf-cue-codegen, observed-contract-promotion-contract, provider-capability-manifest-contract, and capability-spec-contract."
tags: [hobo, anti-slop, oxlint]
---

# protobuf cue + observed promotion + capability slice

Layer `sdlc/anti-slop-79-draft-protobuf-promotion-capability`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `s0-04-protobuf-cue-codegen`, `observed-contract-promotion-contract`, `provider-capability-manifest-contract`, and `capability-spec-contract` is clean.

Local `src/json.ts` parse boundary. Observed contracts use `requiredRecord` to match contract-ir. Tests: codegen 5; observed 5; capability-manifest 7; capability-spec 6.
