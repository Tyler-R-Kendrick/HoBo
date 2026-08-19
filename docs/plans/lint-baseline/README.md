---
type: Plan
title: "Lint baseline"
description: "What biome actually reports across the repo, the errors this pass took to zero, and what remains."
tags: [hobo, plan, tooling]
---

# Lint baseline

## What the repo actually gates

> **Correction (2026-08-19).** An earlier revision of this page claimed the linter
> was switched off and that the findings therefore came from "a checker the repo
> deliberately does not run". That was wrong, and it was wrong in the direction
> that excused the backlog. `biome.json` does set `linter.enabled: false` at the
> top level, but the very next block overrides it:
>
> ```json
> "overrides": [
>   { "includes": ["packages/**", "!packages/**/dist/**"],
>     "linter": { "enabled": true } }
> ]
> ```
>
> The linter is **on for every package**. `biome check .` was always reporting
> real, live findings, and no policy decision was ever needed to start fixing
> them. The rest of this page is rewritten on that basis.

`lint:code` is `biome format scripts/ test/` — formatting only, over two
directories — but it is not the whole story: `biome check .` runs the linter over
`packages/**` and is what the counts below come from.

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

## Errors: 43 to zero

Every biome **error** is now fixed. `biome check .` reports 0 errors across 2314
files. The fixes went into the code, not into suppressions, with two exceptions
noted at the bottom of this section.

| Rule | Count | How it was closed |
|---|---|---|
| `noControlCharactersInRegex` | 18 | One shared `packages/code/src/ansi.ts` |
| `noAssignInExpressions` | 6 | `nextSeq()`, `matchAll`, a named local |
| `useIterableCallbackReturn` | 5 | `for…of` instead of a value-returning arrow |
| `useButtonType` | 5 | Fixed in the generator, not just its output |
| `noImplicitAnyLet` | 3 | Annotated |
| `noUnsafeFinally` | 2 | `finally` reduced to teardown |
| `noShadowRestrictedNames` | 1 | Renamed a local `escape` |
| `noExportsInTest` | 2 | Helpers were only used in-file |
| `noNoninteractiveTabindex` | 1 | Scoped rule-off, reason recorded |

The 18 control-character findings were all deliberate ANSI matchers, reimplemented
in seven places — four of which dodged the rule with `String.fromCharCode(27)`.
They now share one module that owns the suppressions and the reasons. Six duplicate
`plain()` helpers in the test suite alias its `stripSgr`.

### Defects the linter was pointing at

Several findings were not style at all:

- `packages/control-yard/scripts/play-demo.mts` ran its whole video conversion
  inside a `finally`, including a `return` and a `throw`. Either discards whatever
  the demo body threw, so a **broken demo would have reported success**.
- The `S3-02` identity acceptance case tampered with a document's host signature,
  then verified it against a *freshly generated* attestor's keys — so it would have
  been denied either way. It was **passing for the wrong reason**.
- `broker-remote-client` accepted a `presenter` option, ignored it, and both
  callers were passing one.
- The `local-station-auto` readiness card reported a hardcoded `"wired"` while the
  measured readiness was computed and dropped.
- `eveAgentRootPath` ignored both `workspaceRoot` and `parentId` for subagents,
  unlike its sibling branch.
- 286 lines of unreachable TUI renderers in `cli.ts` / `interactive-shell.ts` — one
  was 101 lines — plus five helpers that only they used.

All unused-symbol findings were closed by deleting or wiring up the code. None were
silenced by renaming to `_`, which is what `--unsafe` does and which would have left
the dead code in place under a uglier name.

### The two suppressions

Both carry a written reason at the site: the pixel-village yard host
(`role="application"` *is* an interactive widget — the tabindex is what makes it
keyboard-operable, and the rule does not model that role), and a `greet()` in a
Vercel deploy fixture reachable only through an inline `onclick`.

## What is left

| Rule | Count |
|---|---|
| `noNonNullAssertion` | 432 |
| `noExplicitAny` | 40 |
| `noTemplateCurlyInString` | 31 |
| CSS (`noImportantStyles`, `noDescendingSpecificity`) | 6 |

`noNonNullAssertion` dominates, and it is a direct consequence of
`noUncheckedIndexedAccess: true` in `tsconfig.base.json`: `xs[0]` is
`T | undefined`, so `xs[0]!` is the path of least resistance. The answer is
`@hobo/core/total-access` — `must` / `at` / `first` / `last` / `get`, which narrow
the same way but throw a named `MissingValueError` at the site instead of leaking
`undefined` downstream. It is exposed on a subpath so the snapshot-guarded `@hobo/core`
public surface stays untouched.

### The unsafe autofix is still not usable

`--write --unsafe` cut `noNonNullAssertion` from 434 to 266 but **introduced 56 new
errors** — `noNonNullAssertedOptionalChain`, `noUnsafeOptionalChaining` — by
rewriting `x!.y` into `x?.y` where that changes behaviour. It also renamed a live
`greet()` to `_greet` and silently broke a fixture button. A lint autofix that turns
a crash into a silent `undefined` is worse than the finding it closed. Conversions
go through `scripts/codemod-total-access.mts` instead, which is AST-driven and
leaves anything it cannot rewrite safely for a human.

## Cost of this pass

589 files touched means **every open pull request will conflict**. That is the real
price of a whole-tree reformat, and it is why this is a standalone change rather
than something folded into a feature branch.
