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

### The remaining suppression

The `greet()` in a Vercel deploy fixture is reachable only through an inline
`onclick` and carries a written reason at the site.

## What was left after pass 1

| Rule | Count |
|---|---|
| `noNonNullAssertion` | 432 |
| `noExplicitAny` | 40 |
| `noTemplateCurlyInString` | 31 |
| CSS (`noImportantStyles`, `noDescendingSpecificity`) | 6 |

`noNonNullAssertion` dominates, and it is a direct consequence of
`noUncheckedIndexedAccess: true` in `tsconfig.base.json`: `xs[0]` is
`T | undefined`, so `xs[0]!` is the path of least resistance. The answer is
`@hobo/core/total-access` — `must` / `at` / `first` / `last` / `mustGet`, which
narrow the same way but throw at the site, naming what was missing, instead of
leaking `undefined` downstream. It is exposed on a subpath so the snapshot-guarded `@hobo/core`
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

## Pass 2 result: `noNonNullAssertion` 432 → 77

`scripts/codemod-total-access.mts` rewrote **349 assertions across 147 files in 23
packages**, every one of which already depended on `@hobo/core`. A type fix in
`@hobo/trails` removed six more: `UPGRADE_DRY_RUN_FIXTURES` was annotated
`Readonly<Record<string, UpgradeDryRunRequest>>`, which erased the four known
fixture names and forced an assertion at every read. `satisfies` keeps the same
checking, restores the literal keys, and gives callers autocomplete.

`turbo run build` is green at **122/122** with the rewrite in place.

### What the codemod learned the hard way

Three defects in the tool, each caught by a different gate — worth recording so a
future migration does not rediscover them:

* **Record lookups are not array indices.** The first draft emitted
  `at(attrs, stickyKey)` for `attrs[stickyKey]!` where `attrs` is a
  `Record<string, string>`. `tsc` caught it. `at`/`first` are now restricted to
  numeric literals; every other index falls through to `must`, which is correct
  for both shapes.
* **`Buffer` is indexable but is not an array.** `h[0]!` on a
  `createHash(...).digest()` became `first(h)`, and the helper's `readonly T[]`
  parameter rejected it. The signature is now a structural `Indexed<T>`
  (`{ length, at(i) }`), which admits arrays, strings, TypedArrays and Buffers.
* **A helper name can already be bound in the target file.** `splash.test.ts` has
  a local `const first = …`; importing a helper of the same name and rewriting
  `frames[0]!` to `first(...)` on that line produced
  `noInvalidUseBeforeDeclaration`. The codemod now falls back to a namespace
  import whenever the name is bound anywhere in the file. The first fix for this
  applied the `totalAccess.` prefix with a blanket regex over the whole file,
  which would have redirected a local `function first()`'s own call sites to the
  helper; it now rewrites only the ranges it computed.

### The label is optional on purpose

`must(value, what)` originally required `what`. Measured across the converted
tree, **274 of 291 labels (94%) only transcribed the expression they labelled** —
`must(ownedYard, "ownedYard")`, and at worst
`must(existing[existing.length - 1], "existing[existing.length - 1]")`. The throw
site is already in the stack trace, so `what` is now optional and those 274 are
gone. The 16 that carry real domain vocabulary stayed.

### Still open

77 assertions remain. About 18 are call targets the codemod deliberately refuses
(`handle.withEndpoint!({…})`, `request.fold!(…)`) because wrapping them changes
meaning. The rest sit in packages that do not depend on `@hobo/core`, where the
fix is to restructure rather than to add a dependency for a utility.

## Pass 3 result: `noNonNullAssertion` reaches zero

The remaining 77 were all hand fixes. The codemod could not take them: it skips
call targets, because wrapping `obj.method!(...)` changes what is being called,
and 14 of the packages involved have no `@hobo/core` dependency, where adding
one for a utility is the wrong trade.

**Optional methods** (`overlay.configureMagicDns!`, `store.claimSubscription!`,
`host.streamTurn!`, `container.withDnsRecord!`) go through `node:assert`, which
narrows via its `asserts` signature. No dependency, and a failure names the
missing capability instead of throwing `undefined is not a function` a frame
later.

**Narrowing lost across a closure** — three sites had a correct guard whose
effect did not reach the code that needed it. `replay/storage.ts` tested
`query.harnessFlagKey` and then read it inside a `.filter()` arrow; both
`request.fold` fixtures threw on a non-function and then lost that inside nested
closures. All bound to a local first.

**Guards that were wrong, not merely missing:**

* `contract-harness/parsePactDocument` relied on "issues is empty implies all
  three participants parsed" — true today, invisible to the checker, and false
  the moment a parse helper returns undefined without recording an issue.
* `adapter-openbao` justified `entry.seeds[idx]!` with `idx >= 0`, which holds
  only while `seeds` and `versions` stay the same length.
* `patterns/render.ts` fell back to `renderings[0]!`, i.e. `undefined`, for a
  pattern with no renderings at all.
* `wit/index.ts` asserted a `Map.get` whose guard above tested a *different*
  lookup.

**One rewrite reverted for changing behaviour.** `trails/definition.ts` drains a
BFS queue with `q.shift()!`. An index cursor removes both the assertion and the
O(n) shift — but the loop body calls `q.sort()`, which with a cursor re-orders
entries the traversal has already passed. It is back to `shift()` with an
explicit guard.

The codemod was also **not idempotent**: a second pass added a second
`import { must }`, which biome merged into `import { must, must }` — a parse
error in four files. It now merges into the existing import.

## `noTemplateCurlyInString` is off, deliberately

All 31 findings were legitimate. `${...}` inside a plain string is a first-class
grammar in this codebase, in four different dialects:

* HoBo's own output-reference placeholders, `"${resources.db.outputs.url}"` —
  there is a `parseOutputPlaceholder` whose whole job is to read them;
* Terraform and Cloudflare HCL interpolation, `"${terraform_data.hello.id}"`;
* shell parameter expansion inside generated scripts, `"${GREETING_PREFIX:-hello}"`;
* one template-literal *type* emitted as source text.

The rule exists to catch "you meant a template literal and typed quotes". Here
it has no true positives available to it and will regrow false ones with every
new provider adapter. Thirty-one suppressions would be worse than one policy
line, so it is disabled in `biome.json` with this note as the rationale.

## Final state: zero, against the merged trunk

`biome check .` reports **0 errors and 0 warnings across 2,466 files**.

The counts above describe passes taken against an earlier trunk. Merging this
work forward changed the arithmetic, because the Yard-bindings branch (#1114)
landed 942 files of new code in between and brought its own findings: the merged
tree started at 33 errors and 503 warnings, not the 77 assertions pass 2 left
behind. The burn-down was therefore re-derived on the merged tree rather than
replayed, and these are the numbers from that tree.

`turbo run build` is green at **126/126** with the rewrite in place.

### What the forward-merge itself surfaced

Two defects came from the merge rather than from either branch, and both are
worth recording because neither produced a conflict marker:

* `add-container.ts` was auto-merged cleanly into code that could not run. Trunk
  had introduced a typed `const withEndpoint` arrow; this branch had added a
  later `const withEndpoint = handle.withEndpoint` guard. The regions did not
  overlap, so git took both — a redeclaration in one scope, and a
  temporal-dead-zone `ReferenceError` had it executed. `noRedeclare` and
  `noInvalidUseBeforeDeclaration` caught it.
* `offer-command.ts` ended up importing `SolutionRecipe` twice, once from
  `@hobo/recipes` and once via `recipe-plane.js`, for the same reason.

A clean auto-merge is not evidence that the result is coherent. The linter was
the only thing standing between these and trunk.

### Four packages were rewritten without declaring what they import

The codemod only rewrites packages that already depend on `@hobo/core`; passing
files to it explicitly bypasses that check, which is what happened to
`rift`, `wasp`, `convex` and `control-yard`. Only `rift` failed out loud — the
other three were latent, because the test run stopped at the first failure
having completed 256 of 671 tasks. They were found by auditing every importer of
`@hobo/core/total-access` against its own manifest, not by waiting for successive
runs to reveal them one at a time.

All four now declare `@hobo/core` as a `workspace:*` devDependency. A local copy
of the helper was tried first in `rift` and reverted: four copies of one function
inside a change whose purpose is de-duplication is not a fix, and these packages
do genuinely depend on core — declaring it is the honest description.

### Known, and not caused here

* `lint:boundaries` reports one violation, `pack-framework -> contract-harness`.
  It pre-exists on trunk, that package is untouched here, and the check is not
  part of the pre-commit gate.
* The `wrpc-wit-baseline-poc` draft proof fails its network fetch with
  `self-signed certificate in certificate chain` — the sandbox's TLS
  interception, not a code defect.

## Next: anti-slop (Oxlint)

Biome errors are at zero. The next lint wave is the vendored
[`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop) plugin at
`tools/oxlint/anti-slop/`, configured in `oxlint.config.ts`. Full-repo
`pnpm run lint:slop` still reports a large pre-existing backlog; do not wire
it into `check:all`. `pnpm run lint:slop:changed` is the incremental path:
touched TS/JS only, warnings denied.
