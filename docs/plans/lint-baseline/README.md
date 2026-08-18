---
type: Plan
title: "Lint baseline"
description: "What biome actually reports across the repo, what this pass fixed, and why the remainder is a policy decision rather than a backlog."
tags: [hobo, plan, tooling]
---

# Lint baseline

## What the repo actually gates

`lint:code` is `biome format scripts/ test/` — **formatting only, and only those two
directories**. `packages/` has never been lint-gated, and `biome.json` carries
`linter.enabled: false`. So "the lint findings" are not a backlog the repo has been
ignoring; they are output from a checker it deliberately does not run.

Both configured gates were already green before this pass:

- `pnpm run lint:code` — 65 files, no fixes needed
- `pnpm run lint` (`lint:docs`) — green

## What this pass fixed

Formatting across the whole tree, which is the part that is mechanically safe and
verifiable:

| | Before | After |
|---|---|---|
| `biome check .` errors | **804** | **42** |
| warnings | 624 | 613 |

589 files reformatted. Verified by running the suites of every package with a
meaningful share of the change — 64 test files, 548 tests, all passing — plus a
separate spot check that the recipes goldens still fail for their own
pre-existing reason (fixed in #1123) rather than for anything here.

## What is left, and why it is a decision rather than a task

The remaining **42 errors and 613 warnings** are lint-rule findings, dominated by:

| Rule | Count |
|---|---|
| `noNonNullAssertion` | 434 (205 src / 229 test) |
| `noExplicitAny` | 40 |
| `noUnusedImports` | 37 |
| `noTemplateCurlyInString` | 31 |
| `noUnusedVariables` | 29 |
| everything else | ~110 |

Three things make clearing these a policy call:

1. **They require enabling a disabled linter.** Fixing them without enabling it
   leaves nothing to keep them fixed. Enabling it was tried here and made the
   count *worse* — 711 findings, because it surfaced new categories
   (`noUndeclaredEnvVars`, and more `noNonNullAssertion` in previously
   format-only files).
2. **`biome check --write` fixes none of them.** With the linter disabled no lint
   fixes apply; with it enabled the safe fixes still did not clear the unused-import
   or import-type findings. So this is hand work, not a codemod.
3. **The unsafe autofix is not usable.** `--write --unsafe` cut
   `noNonNullAssertion` from 434 to 266 but **introduced 56 new errors** —
   `noNonNullAssertedOptionalChain` and `noUnsafeOptionalChaining` — by rewriting
   `x!.y` into `x?.y` at sites where that changes behaviour. Reverted. A lint
   autofix that converts a crash into a silent `undefined` is worse than the
   finding it closed.

`noNonNullAssertion` also deserves splitting before anyone burns through 434 sites:
229 are in tests, where `rows[0]!` after an explicit assertion is idiomatic, and 205
are in source, where each one is a real narrowing question. Those two halves want
different answers — a scoped rule override for the first, genuine code changes for
the second — and merging them into one number has been hiding that.

## Cost of this pass

589 files touched means **every open pull request will conflict**. That is the real
price of a whole-tree reformat, and it is why this is a standalone change rather
than something folded into a feature branch.
