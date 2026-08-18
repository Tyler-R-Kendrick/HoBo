---
type: Plan
title: "Package Decomposition — migration"
description: "Staged migration to the topology in docs/design/package-decomposition.md. Every stage is independently shippable."
tags: [hobo, plan, architecture]
---

# Package Decomposition — migration

Target topology: [package-decomposition.md](../../design/package-decomposition.md).

**Sequencing note.** Stages 1 and 2 are pure additions and can start now.
Stages 3 onward move files across package boundaries and will conflict with any
open PR that touches the same trees — they should wait until the consolidation
stack (#1115–#1121) and #1114 have merged, because rebasing a 60-package move
through eight stacked branches costs more than the wait.

## Ordering principle

Each stage leaves the repo green and useful on its own. No stage is a
"preparation" stage whose value depends on the next one landing — that is the
failure mode where half a migration sits in trunk forever.

---

### Stage 1 — name the three manifest kinds, change no behaviour

Extract the schemas that already exist into `@hobo/manifest-capability`,
`@hobo/manifest-request`, `@hobo/manifest-declaration`, `@hobo/manifest-plan`,
each with `.proto` + `.cue` and generated bindings. Existing packages re-export
from them so nothing else changes.

**Done when:** each new package has a conformance suite; every current shape
(`CapabilityRequirement`, `SelectionCandidate`, `ResourceIntent`, `ResourcePlan`,
`STANDARD_CAPABILITY_PROFILES`) is expressible in its new schema **and proven so
by a round-trip test over the existing fixtures**, byte-identical where a digest
is involved.

**Risk:** the four shapes may not be losslessly unifiable. That is the point of
doing it first — if `ResourceIntent` carries something `CapabilityRequirement`
cannot, this stage surfaces it while the change is still one package deep.

---

### Stage 2 — the WIT worlds

Add builder, resolver, and broker worlds to `packages/wit`, beside
`hobo:sdk@0.1.0` and not inside it.

**Done when:** a trivial out-of-tree resolver component satisfies the resolver
world and is driven end-to-end by an in-repo test. A world nothing implements is
a guess; one implementation is the falsification.

---

### Stage 3 — split the provider directory

`packages/providers/*` → `providers/{cloud,ci,ai,policy,infra}/*`.
Mechanical: `git mv`, `pnpm-workspace.yaml` globs, `KNOWN_PACKAGE_PATHS` in
`packages/conformance/src/boundaries.ts`, import specifiers unchanged (package
names do not move).

**Done when:** `npm run lint:boundaries` reports the same edge count as before
the move, and the 18 banked provider→layer-3 edges are unchanged. A changed
count means the move altered classification, which is the one thing this stage
must not do.

---

### Stage 4 — the resolution seam

`@hobo/broker` narrows to registry + match + gates + rank; placement, receipts,
and metering move to `@hobo/broker-placement`. `@hobo/resolvers` gains the
resolver ABI, the direct declaration→plan path, and a shared resolver test kit.

**Done when:** both entry points — brokered and direct — provably run the same
gate stage. The test that matters is the negative one: a declaration that fails
a residency or trust gate must be refused on the *direct* path too, since that
path is the plausible bypass.

---

### Stage 5 — station core, station CLI, station-local

Split `@hobo/stations` into the library, `@hobo/station-cli`, and
`@hobo/station-local`. Add the boundary rule that only a composition root may
import `@hobo/station-local`.

**Done when:** the boundary rule is falsified — adding an illegal import to a
non-composition-root package fails `lint:boundaries` naming the offender.

---

### Stage 6 — `@hobo/host` and the consumers

Split `@hobo/hobo` into `@hobo/host` (composition root library) and the `hobo`
binary. Move the other CLIs and the web apps onto `@hobo/host` or core packages.

**Done when:** `@hobo/hobo`'s non-CLI surface is empty, and each CLI and web app
imports either `@hobo/host` or a core package — not another app's internals.

---

### Stage 7 — the wasm-distributable core

`@hobo/manifest-core` composes stages 1, 2, and 4 into one componentizable unit.

**Blocked on something real:** the default componentize lane emits a *synthetic*
contract-shaped artifact; the real `componentize-js` path is gated behind a
toolchain check. This stage cannot honestly claim a wasm-distributable core
until that lane produces a real component. Ship it as "componentizes under the
real lane, synthetic elsewhere" or not at all — a synthetic artifact described
as distributable is the kind of claim `docs/design/live-provider-matrix.md`
exists to prevent.

---

## Open questions worth deciding before Stage 1

1. **Does `ResourceIntent` survive?** It overlaps `CapabilityRequirement`
   heavily. Either it becomes a projection of the request manifest or it is a
   fourth shape that needs its own justification. Stage 1's round-trip test
   answers this empirically rather than by argument.
2. **Where does `@hobo/dispatcher`'s credit-aware ranking sit** relative to the
   broker's ranking? Two ranking algorithms over one candidate set is a
   correctness question, not a packaging one, and it should be settled before
   Stage 4 fixes a seam around it.
3. **Capability catalog governance.** Adding a refinement edge silently widens
   what every existing request accepts. That needs a review gate with a named
   owner, not just a version bump.
