# Technical standards

HoBo favors compile-time feedback over runtime error discovery. New production-facing code, executable contracts, proof fixtures, and integration boundaries must follow these standards unless an ADR records a narrower exception.

## Language and type feedback

- Use the latest stable TypeScript toolchain for HoBo-authored JavaScript-family code. As of 2026-06-29, npm and the TypeScript project identify TypeScript 6.0.3 / 6.0 as the stable latest line; keep the repo on the current stable line rather than adding new vanilla JavaScript modules.
- Do not add `.js`, `.mjs`, or `.cjs` implementation files when a `.ts` source can provide static feedback. The repo should remain free of tracked JavaScript-family implementation files unless an ADR records a narrow exception.
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

The repo-level `npm run standards:check` gate runs locally, in the pre-commit hook, and in CI. It currently enforces the standards that can be checked without product-specific context:

- `package.json` and `package-lock.json` must keep the TypeScript toolchain declared and locked.
- `AGENTS.md` and this document must retain the canonical Protobuf, CUE, parse-don't-validate, and PACT guidance.
- Implementation files under `src/`, `scripts/`, or `test/` may not use `.js`, `.mjs`, or `.cjs`; use `.ts` unless an ADR/proof note records why the file cannot be TypeScript. The standards gate also fails if any tracked `.js`, `.mjs`, or `.cjs` file remains in the repository.

The repo-wide data-model catalog in `contracts/data-models/` is generated from tracked TypeScript data-model modules and gives each model a Protobuf message plus a CUE definition with source-path, package, domain, integration-boundary, and `cueAnnotated: true` invariants. Boundary-specific checks still belong in the relevant proof package: Protobuf descriptor parity, CUE evaluation, PACT fixtures, and parse/refinement tests should be implemented beside the contract they protect.

## Agent checklist

Before committing a technical change, agents must verify:

1. New JavaScript-family code is TypeScript-first and typechecked.
2. Boundary payloads have Protobuf contracts or an explicit documented reason they do not.
3. Invariants/dependent constraints live in CUE, not scattered runtime checks.
4. Parsed/refined domain objects are passed inward instead of raw input DTOs.
5. Integration boundaries have PACT-style consumer/provider coverage or a tracked proof gap.
6. Matching docs and proof/contract READMEs describe the contract source, generated views, and gates.
