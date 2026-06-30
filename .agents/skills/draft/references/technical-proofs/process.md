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
pnpm exec turbo run test --filter ./src/draft/technical-proofs/<slug>
```

Then run repo gates selected by changed files, especially `pnpm run architecture:guard`, `pnpm run test:schema`, `pnpm run test:unit`, `pnpm run test:types`, and `pnpm run standards:check -- --base=origin/main` when scripts, contracts, or TypeScript implementation changed.
