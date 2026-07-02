---
name: draft
description: Use when creating, moving, reviewing, or planning HoBo draft proof material under src/draft. Routes work across technical proofs, experience proofs, epic proofs, and project MVP rollups with progressive-disclosure references.
---

# Draft

Use this skill for HoBo draft proof work. The old one-level draft layout is obsolete. All draft work belongs under one taxonomy path:

- `src/draft/technical-proofs/<slug>`
- `src/draft/exp-proofs/<type>/<slug>`
- `src/draft/epic-proofs/<slug>`
- `src/draft/projects/<slug>`

## First moves

1. Read `src/draft/README.md` and the relevant reference below.
2. Classify the work by the smallest proof layer that can answer the question.
3. Keep proofs isolated. Mock or simulate every dependency outside the proof's atomic unit.
4. Use `git mv` for any existing draft package move or rename.
5. Record architectural or experience decisions in ADRs beside the proof package.
6. Run the narrowest package gate first, then repo gates required by changed files.

## Reference routing

- Planning or intake: read `references/plans/process.md`.
- Atomic technical concept: read `references/technical-proofs/process.md`.
- UX, DX, CX, API, SDK, or other human/interface experience: read `references/exp-proofs/process.md`.
- Epic-level rollup of technical and experience proofs: read `references/epic-proofs/process.md`.
- Project MVP rollup across epics: read `references/projects/process.md`.

## Guardrails

- Never add live cloud, provider, identity, billing, or support dependencies to default proof tests.
- Prefer protobuf, CUE, Pact, type tests, and deterministic fixtures over prose-only proof.
- For technical proofs, performance is either measured deterministically or explicitly marked not applicable in the ADR.
- For experience proofs, model the audience and measurable friction before choosing the mockup or interface shape.
- For epic and project rollups, propagate compatibility changes downward with ADRs instead of hiding integration changes only at the rollup layer.
