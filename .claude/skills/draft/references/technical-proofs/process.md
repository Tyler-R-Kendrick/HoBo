---
type: Agent Skill Reference
title: "Technical proof reference"
description: "Define isolated atomic technical proof artifacts, mocks, ADRs, contracts, tests, and performance evidence."
tags: [hobo, draft, technical-proofs, contracts]
timestamp: 2026-06-30T00:00:00Z
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

## Validation

Run package-scoped checks first:

```bash
pnpm --prefix src/draft/technical-proofs/<slug> test
```

Then run the relevant-check router for the narrow changed scope:

```bash
pnpm run agent:check -- --staged
```

After committing a focused proof fix, use no-arg `pnpm run agent:check` for latest-commit validation. Use PR-base, full unit, contract, or all-package sweeps only when final/all validation is explicit.
