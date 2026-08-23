---
type: Plan
title: "anti-slop slice: resource collection + azure full manifest"
description: "File-complete anti-slop cleanup for resource-collection-engine-contract and s4-03-provider-azure-full-capability-manifest."
tags: [hobo, anti-slop, oxlint]
---

# resource collection + azure full manifest slice

Layer `sdlc/anti-slop-55-draft-collection-azure`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `resource-collection-engine-contract` and `s4-03-provider-azure-full-capability-manifest` is clean.

Local `src/json.ts` parse boundary. Collection input is a named `CollectionInputSource` bag; handle/context indexes use named factory/verb types. Tests: collection 11, azure 10 + `tsc -p tsconfig.types.json`.
