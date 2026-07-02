# HoBo draft proof packages

`src/draft/` contains executable proof and contract material. These packages are not production HoBo implementation. They turn design claims, ADRs, Linear slices, and rollout decisions into runnable evidence.

## Taxonomy

- `technical-proofs/<slug>`: isolated atomic technical concept. Mock everything outside the concept. Required artifacts: README, ADR, contract fixtures where boundaries exist, protobuf/CUE/Pact evidence when applicable, parse-don't-validate notes, capability tests, and a deterministic performance envelope or an ADR-recorded reason performance does not apply.
- `exp-proofs/<type>/<slug>`: experience proof grouped by type (`dx` · `ux` · `cx` · `ax` · `api`; see `_classification.md`). Required artifacts: README, ADR, audience model, friction inventory, measurable standards/specs, and either wireframes/image mockups for UX surfaces or interface declarations/type tests for API and SDK surfaces.
- `epic-proofs/<slug>`: isolated epic rollup. Reuse technical and experience proof artifacts instead of copying logic. Required artifacts: README, ADRs for compatibility changes, Gherkin/Cucumber feature suites, mocked service boundaries, Pact fixture inventory, simulation notes, and a rollup ledger.
- `projects/<slug>`: project MVP rollup. Integrate epic proofs and propagate required design or implementation changes downward with ADRs. This layer starts with registry/templates only; do not invent MVPs without a scoped project.

## How to read a package

Each proof package should explain:

- Which design plan, ADR, proof note, or `HOBO-N` issue it supports.
- Which draft kind it belongs to and why.
- What is in scope and out of scope.
- What command proves the contract.
- What remains mocked, simulated, deferred, or intentionally non-production.
- Which artifacts roll up from lower layers or propagate back down.

## Maintenance rules

- Use `git mv` for taxonomy moves so package history survives.
- Keep proof package READMEs aligned with code changes in that package.
- Link human-readable proof notes under [`../../docs/design/proofs`](../../docs/design/proofs) when one exists.
- Do not add live cloud credentials or static secrets.
- Prefer deterministic, offline tests that can run in CI.
- Mock service boundaries with Pact/protobuf/CUE-derived fixtures instead of live services.
- Document any environment requirement that differs from the repo default Node.js 24 runtime.
