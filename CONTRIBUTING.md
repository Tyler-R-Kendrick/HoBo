# Contributing to HoBo

HoBo is design-first. A useful contribution either clarifies the design, proves a design claim with an executable draft contract, or improves the maintenance system that keeps those two aligned.

## Before you start

1. Read [`README.md`](./README.md) for project purpose and current state.
2. Read [`AGENTS.md`](./AGENTS.md) before using an AI coding agent in this repo.
3. Find the relevant design area in [`docs/design/index.md`](./docs/design/index.md).
4. For implementation-facing work, find the matching proof note under [`docs/design/proofs/`](./docs/design/proofs/) or draft package under [`src/draft/`](./src/draft/README.md).

## What belongs here

Good changes usually fall into one of these buckets:

- Design docs, ADRs, glossary entries, CLI/spec changes, or traceability updates.
- `src/draft/*` proof/contract packages that make a design claim executable.
- Validation scripts, CI gates, and repository-maintenance automation.
- Reference notes in `docs/standards/`, `docs/technologies/`, `docs/patterns/`, or `docs/competitors/` that support a design decision.

Out of scope for now:

- Claiming HoBo is production-ready.
- Adding production product code without a linked design claim and proof path.
- Adding provider credentials, static secrets, or live cloud dependencies to default tests.

## Required local checks

Use Node.js 24, matching CI.

```sh
npm ci
npm test
npm run docs:cli-lint
npm run docs:design-lint
npm run docs:coverage
npm run docs:freshness
node scripts/validate-traceability.mjs
node scripts/validate-sdk-contracts.mjs
node scripts/validate-deployment-set-delta.mjs
```

Optional local hook:

```sh
npm run prepare-hooks
```

## Documentation rule

Docs must move with code. If you touch code, draft packages, tests, scripts, workflows, package metadata, hooks, or agent tooling, update the closest relevant documentation in the same pull request.

Use this checklist:

- README still describes the repo accurately.
- `docs/design/index.md` still describes current design organization.
- Relevant design doc, ADR, proof README, or draft package README changed with the implementation.
- New public commands or examples pass `npm run docs:cli-lint`.
- New ADR references are indexed and pass traceability validation.
- New event families are added to `docs/design/event-families.md` before use.

## Pull request expectations

Every PR should include:

- Purpose and scope.
- Files or design areas changed.
- Tests and validators run.
- Documentation updated, or a clear reason no docs were needed.
- Known limitations, especially environment limitations or intentionally deferred work.

Prefer small PRs tied to one design claim or one backlog slice.
