---
type: Agent Skill Reference
title: "Technical proof reference"
description: "Define isolated atomic technical proof artifacts, mocks, ADRs, contracts, tests, and performance evidence."
tags: [hobo, draft, technical-proofs, contracts]
timestamp: 2026-07-02T00:00:00Z
---

# Technical proof reference

Technical proofs live at `src/draft/technical-proofs/<slug>`.

## Purpose

Prove one atomic technical concept in complete isolation. Mock everything outside that concept, including provider APIs, control-plane services, identity systems, storage, queues, clocks, networks, billing, and external SDKs.

## Required artifacts

- `README.md` with source issue/design link, scope, non-scope, proof command, and mocked boundaries.
- `ADR.md` for the technical decision, alternatives rejected, compatibility consequences, and performance applicability.
- Contract fixtures beside the package when boundaries exist: protobuf, CUE, Pact, WIT, runtime guard, or generated type views as appropriate.
- Tests for technical capability in isolation.
- Deterministic performance envelope, or ADR text explaining why performance is not applicable.
- `proof.json` manifest (schema: `scripts/lib/proof-manifest.ts`) declaring layer, references, artifacts, and waivers — this drives the gates below.
- `examples/` with at least one runnable, documented example (`<name>.ts` + committed `<name>.expected.txt`). **The draft-artifact gate executes examples and diffs the output.**
- `notebook.ipynb` (tslab TypeScript kernel) demonstrating technical usage, committed **with executed outputs** (structure-gated; the examples pair carries executable enforcement).
- Mermaid architecture diagram in the README where relevant (declare in `proof.json` `artifacts.diagrams`; waive with an ADR when a diagram adds nothing).
- `bench/*.bench.ts` (vitest bench) performance metrics with a committed `bench/baseline.json`. Numbers are advisory trend data; the gate requires declared benches to **execute**. Waive via `proof.json` with an ADR when there is nothing to benchmark.

Scaffold new proofs from `src/draft/_templates/technical/`. Packages listed in `src/draft/_grandfathered.json` predate these requirements and receive advisory warnings until their backfill wave lands; never add new packages to that list.

## Validation

Run package-scoped checks first:

```bash
pnpm --prefix src/draft/technical-proofs/<slug> test
```

Then run the relevant-check router for the narrow changed scope:

```bash
pnpm run agent:check -- --staged
```

The relevant-check router runs `draft:artifacts` (per-layer artifact requirements) and `draft:cascade` (changed proofs must update referencing epic/project rollups) for changed proof packages automatically. After committing a focused proof fix, use no-arg `pnpm run agent:check` for latest-commit validation. Use PR-base, full unit, contract, or all-package sweeps only when final/all validation is explicit.
