---
layout: ../../layouts/Docs.astro
title: Contributing
description: "What a useful HoBo contribution looks like in the design phase, the required local checks, and what reviewers expect in a PR."
---

# Contributing

HoBo is design-first. A useful contribution either **clarifies the design**, **proves a design claim** with an executable draft contract, or **improves the maintenance system** that keeps those two aligned. Full text: [`CONTRIBUTING.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/CONTRIBUTING.md).

## What belongs here

- Design docs, ADRs, glossary entries, CLI/spec changes, traceability updates.
- `src/draft/<kind>/<slug>` proof/contract packages that make a design claim executable.
- Validation scripts, CI gates, and repository-maintenance automation.
- Reference notes in `docs/standards/`, `docs/technologies/`, `docs/patterns/`, or `docs/competitors/` that support a design decision.

**Out of scope for now:** claiming HoBo is production-ready; production product code without a linked design claim and proof path; provider credentials, static secrets, or live cloud dependencies in default tests.

## Before you start

1. Read the [README](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/README.md) for purpose and current state.
2. Using an AI agent? Read [`AGENTS.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/AGENTS.md) first — and see the [agent docs](/HoBo/agents/).
3. Find the relevant design area in the [design suite index](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/index.md).
4. For implementation-facing work, find the matching proof note under `docs/design/proofs/` or draft package under `src/draft/`.

## Required local checks

Use Node.js 24 to match CI.

```sh
npm ci
npm test
npm run standards:check
npm run docs:cli-lint
npm run docs:design-lint
npm run docs:coverage
npm run docs:freshness
node --import tsx scripts/validate-traceability.ts
node --import tsx scripts/validate-sdk-contracts.ts
node --import tsx scripts/validate-deployment-set-delta.ts
```

See [Checks & CI gates](/HoBo/develop/gates/) for what each one protects.

## The documentation rule

**Docs move with code.** If you touch code, draft packages, tests, scripts, workflows, package metadata, hooks, or agent tooling, update the closest relevant documentation in the same PR — the `docs:freshness` gate enforces the minimum. The review checklist:

- README still describes the repo accurately.
- `docs/design/index.md` still describes the design organization.
- The relevant design doc, ADR, proof README, or draft package README changed with the implementation.
- New commands/examples pass `docs:cli-lint`; new ADR references pass traceability.
- New event families are added to `docs/design/event-families.md` before use.
- New JS-family files are TypeScript, or the exception is recorded in an ADR.

## Pull request expectations

Every PR should state: purpose and scope · files or design areas changed · tests and validators run · documentation updated (or why none was needed) · known limitations. **Prefer small PRs tied to one design claim or one backlog slice.**
