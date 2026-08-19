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
| 01 | `claude/consolidate-01-core-manifest-utils` | Manifest codec into `@hobo/core` + pinning tests | **done** (PR pending) |
| 02 | `claude/consolidate-02-migrate-provider-manifests` | aws/azure/gcp/lakebed/convex onto it (−275) | pending |
| 03 | `claude/consolidate-03-migrate-runner-manifests` | blacksmith/depot/github (−46) | pending |

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
