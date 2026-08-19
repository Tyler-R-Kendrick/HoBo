# sdlc-state: consolidate-duplication

**Phase:** dispatch (parent-implemented; no subagent offload authorised)
**Trunk:** `main` @ `618129362`

**Tooling deviation:** `gh` is unavailable in this environment, so `gh stack` cannot be used.
Stack topology is plain git — each layer branches off the one below — and PRs are opened via
the GitHub MCP with an explicit `base`, which is the shape `gh stack submit` produces.
`gh stack sync` is replaced by an explicit `git rebase --onto` when a lower layer moves.

## Corrections carried into this plan

Two of my own estimates were wrong. Both are recorded because the measurement is the point:

| Claim | First estimate | Measured | Why the first was wrong |
|---|---|---|---|
| provider `manifest.ts` duplication | ~1,500 lines | **321 byte-identical** | `sed 's/aws/PROV/gi'` also rewrote unrelated substrings |
| pixel-village ↔ control-yard | 18,236 lines | **515 text lines** | `wc -l` counted PNG keyframes as lines |

## Layers

| # | Branch | Scope | State |
|---|---|---|---|
| 00 | `claude/consolidate-00-green-trunk-boundaries` | Make the boundary gate actually run | **done** — PR #1115 |
| 01 | `claude/consolidate-01-core-manifest-utils` | Manifest codec into `@hobo/core` + pinning tests | **done** — PR #1116 |
| 02 | `claude/consolidate-02-migrate-provider-manifests` | aws/azure/gcp/lakebed/convex onto it | **done** (−356) |
| 03 | ~~`claude/consolidate-03-migrate-runner-manifests`~~ | blacksmith/depot/github | **cancelled — not duplication** |

### Layer 00 — why it exists, and why it is the bottom

Not planned. Found when layer 01's gates were run against a clean main checkout: `lint:boundaries`
did not fail, it **crashed**. `parseWorkspaceEdge` throws on a workspace path it cannot classify,
and `listPackageJsonFiles` recursed unboundedly for any `package.json` under `packages/` — so it
swept up things that are not workspace packages at all (`packages/code/examples/*`,
`packages/hobo/fixtures/deploy/vercel`, the scaffolding templates under
`packages/patterns/patterns/*`), hit the first one, and aborted.

**An aborted gate is indistinguishable from a clean one** to anything that only reads an exit code.
Trunk had no boundary enforcement whatsoever, and had not for some time: 15 real workspace packages
were also unclassified, including `packages/bindings` and `packages/status-page`.

Fixed at the cause — discovery now reads the `pnpm-workspace.yaml` globs (the only authority on
what a workspace package is), scoped to the caller's root so it does not widen into `src/draft/**`.

With the gate finally running it reported **36 real violations across 8 provider packages** —
layer-2 adapters importing layer-3 packages directly. Those are banked in
`ACCEPTED_ADAPTER_PACKAGE_EDGES` (18 unique edges) rather than fixed here: restructuring eight
providers is not this initiative, and banking is the same ratchet shape `lint:budget` already uses
for biome. **The list should only ever shrink.**

Out of this stack, each its own follow-up: the 18 banked provider edges; `pixel-village` ↔
`control-yard` (515 lines, needs a package-edge decision, not a code move); the 8 provider
transports onto core's `guardTransport`.

## Log

- 00: gate repaired, 14+1 packages classified, 18 edges banked, regression test added and falsified
  (removing one entry names it). `violations: []` across 261 discovered edges.
- 01: codec added to `@hobo/core` as a pure addition; nothing migrated yet, so this layer cannot
  change any published manifest. 18 pinning tests, with `canonicalJson`/`stableDigest` literals
  captured from the pre-move provider implementation so a "tidier" rewrite fails here rather than
  at a consumer. Baseline bytes for all five providers captured out-of-tree for layer 02 to diff
  against.
- 02: five providers migrated, net −356 lines. Verified by capturing all 20 published documents
  (5 providers x 4) before and after and diffing: **byte-identical**. The comparator was itself
  falsified by perturbing one byte, which it detected. convex keeps its own parser (it genuinely
  differs) and shares only the helpers.

## Layer 03 was cancelled, and the reason is the useful part

The three runners (`runner-blacksmith`, `runner-depot`, `runner-github`) share a byte-identical
23-line helper block, which is how a hash-based duplicate scan grouped them and how they ended up
in this plan as "46 removable lines". Reading the block before migrating it showed the grouping was
right and the conclusion was wrong:

| Helper | Providers (`920f2c1d`) | Runners (`b4ea7026`) |
|---|---|---|
| `canonicalJson` | same | same |
| `sortKeys` | same (untyped) | same (generic `<T>`) |
| `digestRef` | `fnv:` — the non-cryptographic FNV-ish walk | **`sha256:` via `node:crypto`** |
| `stableDigest` | present | **absent** |

`digestRef` is **a different algorithm wearing the same name**. Migrating the runners onto core's
version would rewrite every digest reference they publish from `sha256:…` to `fnv:…` — exactly the
silent-breakage class that layer 01's pinning tests exist to prevent, and it would have been
delivered under a line-count win.

What is actually shared is `canonicalJson` plus `sortKeys`, roughly 36 lines across three files.
Taking it would mean exporting `sortKeys` from `@hobo/core` as public surface, because each runner
still needs it for its own sha256 digest. Widening a layer-0 package's API to save ~36 lines in
three layer-2 packages is a bad trade, so the runners are left alone.

### The finding worth escalating

Two different digest algorithms are in use inside the **same document family**. Providers publish
`fnv:` references in `/.well-known/capability-manifest/cost.json`; runners publish `sha256:` ones.
A consumer verifying a reference has to know which kind of package produced it.

The runners are almost certainly the ones that are right. `stableDigest`'s own comment calls itself
"deterministic non-cryptographic" and "not a security primitive", and a 32-bit FNV-ish walk has
collisions well within reach for an attacker who controls document content — and these documents
come from a provider-controlled origin.

**This is not fixable by a refactor.** Changing the providers to sha256 changes every reference they
have already published, so it needs an owner decision about versioning the manifest schema, not a
consolidation PR. Flagged here rather than silently unified.

## Layer 03 reinstated — the cancellation was wrong

Layer 03 was cancelled on the grounds that the runners' `digestRef` is `sha256:` while core's
was `fnv:`, so migrating them would rewrite every published digest reference. The premise was
checked and did not hold:

- **Nothing verifies these values.** `runner-github/src/manifest.ts` checks only that
  `fact.source.digest` is a non-empty string. The only assertions on the `fnv:` prefix anywhere
  in the repo were the ones added by layer 01 an hour earlier.
- **Nothing has been published.** No manifest has ever gone from this repo to a live provider.

So the cost of converging was zero, and the cost of not converging was two algorithms behind one
name. **Converged on SHA-256**, which is what the runners already did and what the threat model
requires: these bundles are fetched from a provider-controlled origin, and a 32-bit FNV walk
emitting 8 hex digits is brute-forceable in milliseconds — a typo detector, not integrity.
`stableDigest`'s own comment said "not a security primitive", which was accurate and was the bug.

Verified: 10 of 20 published documents changed, and the only differing fields are `digest` and
`documentRef`, with line counts unchanged — no structural drift. All five provider suites, all
three runner suites and core stayed green, which is itself the evidence that nothing consumed
the old values.

With the algorithms equal the runners could join: −72 lines across the three, and `sortKeys` is
now exported from core because `runner-github` needs the ordered *object*, not the string.

## Layer 04 — the stack was adding lines, so this subtracts them

Called out and correct: layers 00–03 were net **+215** across the stack, and test files alone
were **+234 with zero deletions**. A consolidation initiative that only adds is not one.

`describeConcern` (in `@hobo/contract-harness`) reads a `.cases.jsonl` beside the test, groups
rows by member, and emits one test per member. Setup and teardown are declared once as
`subject`/`teardown`. A case is a line of data, so adding one is a one-line diff instead of
another copy of arrange-act-assert.

It also does what a hand-written suite cannot: the subject's callable surface is read at runtime
and **a member with no cases fails the suite**, naming it. Falsified by adding an untested export
— `expected [ 'untestedHelper' ] to deeply equal []`.

| Suite | Before | After | Delta |
|---|---|---|---|
| `capability-manifest` | 166 | 56 (25 test + 31 cases) | −110 |
| `naming` | 119 | 33 (18 test + 15 cases) | −86 |
| harness | — | 158 | +158 |
| **layer total** | | | **−28** |

Core went from 155 to 166 tests while shrinking, and every further adopter is pure subtraction —
the harness cost is paid once.

Two harness bugs were found by using it rather than by reading it: `match` compared
`String(actual)`, which is `[object Object]` for any returned record; and ES module namespaces
expose every export as a getter, so constants were being demanded as "members needing cases".
Module namespaces now cover functions only — a constant is pinned by the cases that use it.

