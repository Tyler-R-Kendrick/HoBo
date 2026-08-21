---
type: Plan
title: "anti-slop slice: snapshot compaction, kubernetes contract"
description: "File-complete anti-slop cleanup for snapshot-compaction-contract and provider-kubernetes-contract."
tags: [hobo, anti-slop, oxlint]
---

# snapshot compaction + kubernetes contract slice

Layer `sdlc/anti-slop-63-draft-snapshot-k8s`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `snapshot-compaction-contract` and `provider-kubernetes-contract` is clean.

Local `src/json.ts` parse boundary. Compaction helpers stay generic (`hashStable`/`sortStable`/`deepEqual`) so TState and stored-event maps are not forced through JsonValue. Tests: snapshot 8 + `tsc`; kubernetes-contract 5 + `tsc`.
