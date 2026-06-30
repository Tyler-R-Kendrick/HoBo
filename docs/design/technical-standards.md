---
type: Reference
title: "Technical standards"
description: "Repository technical standards: TypeScript-first implementation, Protobuf, CUE, parse-don't-validate, and PACT contract requirements enforced by the standards gate."
tags: [hobo, design]
---

# Technical standards

HoBo favors compile-time feedback over runtime error discovery. New production-facing code, executable contracts, proof fixtures, and integration boundaries must follow these standards unless an ADR records a narrower exception.

## Language and type feedback

- Use the latest stable TypeScript toolchain for HoBo-authored JavaScript-family code. As of 2026-06-29, the package registry and the TypeScript project identify TypeScript 6.0.3 / 6.0 as the stable latest line; keep the repo on the current stable line rather than adding new vanilla JavaScript modules.
- Do not add `.js`, `.jsx`, `.mjs`, or `.cjs` implementation files when a TypeScript-family source can provide static feedback. Use `.ts` by default, `.tsx` for React/JSX, `.mts` for ESM scripts that would otherwise be `.mjs`, and `.cts` only for explicit CommonJS requirements. The repo should remain free of tracked JavaScript-family implementation files unless an ADR records a narrow exception.
- Prefer generated, checked-in type views over hand-maintained structural duplicates: WIT remains the portable component interface, TypeScript is the authoring/reference language, Protobuf is the data-contract wire shape, and CUE carries invariants that TypeScript alone cannot prove.
- Compiler/typecheck failures should be treated as design feedback. A change that relies on a runtime exception for shape, range, state-machine, or boundary mismatch is incomplete unless the mismatch is inherently runtime-only and documented.

## Data contracts and derived object definitions

- Model data contracts in Protobuf at integration and persistence boundaries. Protobuf descriptors are the canonical interchange artifact for event bodies, service messages, provider-adapter payloads, and external API contracts; other views are generated from the same source family.
- Keep WIT, Protobuf, TypeScript, Zod/runtime guards, and documentation in sync through code generation or explicit contract fixtures. Handwritten duplicate schema definitions are allowed only as temporary migration shims with a removal note.
- Use CUE for invariants, refinements, and dependent constraints: ranges, formats, cross-field relationships, state-transition preconditions, provider capability predicates, environment-specific obligations, and compatibility rules.
- Apply "Parse, don't validate": unknown/untrusted inputs cross one parser boundary that produces a refined domain object. Downstream code consumes the parsed/refined type, not raw DTOs plus repeated boolean validation.
- Represent post-parse states as derivative object definitions. Example: `RawDeploymentRequest` parses to `DeployableBindle` only after CUE constraints, Protobuf shape, policy obligations, and dependency constraints succeed; functions that deploy accept `DeployableBindle`, not `RawDeploymentRequest`.

## Integration boundaries and contract testing

- Every integration boundary needs a consumer-driven contract: SDK ↔ runtime, runtime ↔ provider adapter, control plane ↔ data plane, CLI ↔ daemon/API, event producer ↔ projection consumer, generated plugin ↔ host, and HoBo ↔ external service.
- Use PACT-style contract testing for those boundaries. HoBo's Contract IR can import/export PACT, OpenAPI, AsyncAPI, and Protobuf artifacts, but consumer/provider compatibility must be exercised before deploy and recorded as proof material.
- Prefer contract, conformance, typecheck, and CUE evaluation gates before runtime integration tests. Runtime tests remain necessary for behavior, determinism, and provider realism, but they should not be the first place schema or invariant drift appears.

## Enforcement

The repo-level `pnpm run standards:check` gate runs locally, in the pre-commit hook, and in CI. It currently enforces the standards that can be checked without product-specific context:

- `package.json` and `pnpm-lock.yaml` must keep the TypeScript toolchain declared and locked.
- `AGENTS.md` and this document must retain the canonical Protobuf, CUE, parse-don't-validate, and PACT guidance.
- Implementation files under `src/`, `scripts/`, or `test/` may not use `.js`, `.mjs`, or `.cjs`; use `.ts` unless an ADR/proof note records why the file cannot be TypeScript. The standards gate also fails if any tracked `.js`, `.mjs`, or `.cjs` file remains in the repository.

Repository-wide data-model catalogs are forbidden. Each project/package that owns a CUE-constrained type must keep its own `data-models/` folder beside the protobuf contract or proof package that owns that type. Protobuf descriptor parity, CUE evaluation, PACT fixtures, and parse/refinement tests must be implemented beside the contract they protect, not through a central `contracts/data-models` bridge.

## Agent checklist

Before committing a technical change, agents must verify:

1. New JavaScript-family code is TypeScript-first and typechecked.
2. Boundary payloads have Protobuf contracts or an explicit documented reason they do not.
3. Invariants/dependent constraints live in CUE, not scattered runtime checks.
4. Parsed/refined domain objects are passed inward instead of raw input DTOs.
5. Integration boundaries have PACT-style consumer/provider coverage or a tracked proof gap.
6. Matching docs and proof/contract READMEs describe the contract source, generated views, and gates.

## Performance-oriented local gates

Local and pre-commit automation must prefer changed-file scopes over whole-repository sweeps. The default hook runs `pnpm run check:relevant:staged`, which maps staged paths to root gates, documentation gates, contract validators, and pnpm-filtered `src/draft/*` package tests. Full-repository checks remain available for merge confidence, but agents and humans should use the relevant check runner while iterating.

TypeScript proof code should use the repository-pinned latest stable TypeScript version. For experiments that need the Go-native TypeScript toolchain, the repository also pins `@typescript/native-preview`; keep proof packages on the shared TypeScript pin instead of adding older per-package compiler versions.

Package-manager standard: use pnpm, not npm, Yarn, or Bun, for repository-wide dependency installs and scripted gates. pnpm's content-addressable store and workspace filtering are the default performance path; Turborepo provides task graph caching; when the local Turbo native runner cannot start, relevant-check gates must fall back to filtered pnpm package proofs rather than skipping package tests. Vite is reserved for browser app packages that need a dev server; Bun is reserved for explicit Bun-runtime experiments with parity proof.

Linting standard: pre-commit lint must be path-scoped and cache-friendly. Use `pnpm run lint:docs:staged` for local commits, `pnpm run lint:docs:changed -- --base=<ref>` for branch work, and reserve `pnpm run lint:docs` for full verification. Shared documentation catalogs may widen a changed-file lint to a full scan when their contents affect global references.
