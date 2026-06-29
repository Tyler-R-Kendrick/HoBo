# HoBo draft proof packages

`src/draft/` contains executable proof and contract packages. They are not a production HoBo implementation. They exist to turn design claims, ADRs, and Linear slices into runnable evidence.

## How to read this directory

Most packages map to one of these shapes:

- `*-contract`: public surface, schema, conformance, or workflow contract for a specific slice.
- `*-spike`: time-boxed proof for a risky design question.
- `epic-reference-implementations/*`: broader mocked reference flows that stitch several contracts together.

Each package should have its own README explaining:

- Which design plan, ADR, proof note, or `HOBO-N` issue it supports.
- What is in scope and out of scope.
- What command proves the contract.
- What remains mocked, deferred, or intentionally non-production.

## Maintenance rules

- Keep proof package READMEs aligned with code changes in that package.
- Link human-readable proof notes under [`../docs/design/proofs/`](../docs/design/proofs/) when one exists.
- Do not add live cloud credentials or static secrets.
- Prefer deterministic, offline tests that can run in CI.
- Document any environment requirement that differs from the repo default Node.js 24 runtime.
