---
type: Plan
title: "Lint baseline"
description: "What biome actually reports across the repo, what the formatting pass closed, and what the remaining findings are."
tags: [hobo, plan, tooling]
---

# Lint baseline

## What the repo actually gates

`lint:code` is `biome format scripts/ test/` — formatting only, over two
directories. It is tempting to read `biome.json`'s top-level `linter.enabled: false`
and conclude the findings below come from a checker the repo deliberately does not
run. That reading is wrong, and it is wrong in the direction that excuses the
backlog: the very next block overrides it.

```json
"overrides": [
  { "includes": ["packages/**", "!packages/**/dist/**"],
    "linter": { "enabled": true } }
]
```

The linter is **on for every package**. `biome check .` reports real, live
findings, and no policy decision is needed before fixing them — only the work.

Both configured gates are green:

- `pnpm run lint:code` — no fixes needed
- `pnpm run lint` (`lint:docs`) — green

## The formatting pass

Formatting across the whole tree is the mechanically safe half, and it took
`biome check .` errors from **804** to the low tens. It was authored as a
standalone 592-file change for a reason worth recording: a whole-tree reformat
conflicts with every open pull request, so folding it into a feature branch
would have made both harder to review.

By the time it landed, most of those files had already been reformatted by the
branches that merged ahead of it, so what remained here was small. That is the
expected outcome of a formatting change racing other work, not a sign it was
unnecessary — the tree is formatted either way.

## Where the count stands now

`biome check .` over 2,462 files: **33 errors, 503 warnings.**

| Rule | Count | Kind |
|---|---|---|
| `noNonNullAssertion` | 409 | warning |
| `noExplicitAny` | 40 | warning |
| `noTemplateCurlyInString` | 22 | warning |
| `noUnusedVariables` | 22 | warning |
| `noControlCharactersInRegex` | 15 | error |
| `noAssignInExpressions` | 5 | error |
| `useButtonType` | 4 | error |
| `noImportantStyles` | 4 | warning |
| `noUnsafeFinally` | 2 | error |
| `noCommaOperator` | 2 | warning |
| `noDescendingSpecificity` | 2 | warning |
| everything else | 1 each | mixed |

`noNonNullAssertion` is 81% of the total on its own, which is why the headline
number moves so little until that one rule is addressed.

## Two things learned the hard way

**The unsafe autofix is not usable here.** `biome check --write --unsafe` cut
`noNonNullAssertion` from 434 to 266 but **introduced 56 new errors** —
`noNonNullAssertedOptionalChain` and `noUnsafeOptionalChaining` — by rewriting
`x!.y` into `x?.y` at sites where that changes behaviour. It also renamed a live
`greet()` to `_greet`, breaking an `onclick` handler in a fixture. Reverted. A
lint autofix that converts a crash into a silent `undefined` is worse than the
finding it closed.

**`noNonNullAssertion` deserves splitting before anyone burns through it.**
Roughly half the sites are in tests, where `rows[0]!` after an explicit assertion
is idiomatic, and half are in source, where each one is a real narrowing
question. Those two halves want different answers — a scoped rule override for
the first, genuine code changes for the second — and merging them into one
number hides that.
