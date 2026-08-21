---
type: Plan
title: "anti-slop slice: recipes"
description: "File-complete anti-slop cleanup for packages/recipes."
tags: [hobo, anti-slop, oxlint, recipes]
---

# recipes slice

Layer `sdlc/anti-slop-09-recipes`. `packages/recipes` is oxlint
`--deny-warnings` clean: branded parsers write the unique-symbol field,
optional fields use `undefined` spreads, tests use named Json/snapshot
types.
