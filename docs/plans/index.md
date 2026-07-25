# HoBo plans

Directory listing for audit/review logs and improvement plans written to `docs/plans/` by the `/improve` tooling (per [`CLAUDE.md`](../../CLAUDE.md)).

## Documents

| File | Type | Purpose |
|---|---|---|
| [`0000-requirements-suite-review.md`](./0000-requirements-suite-review.md) | Review Findings | Historical `/improve` audit of the requirements suite at b3cf64d, reconciled with PR #1 review. |
| [`0001-scope-refactor-review.md`](./0001-scope-refactor-review.md) | Implementation Plan | Review-and-improve log for the Yard⊃Camp⊃Bindle scope refactor. |
| [`0002-public-launch-gap-analysis.md`](./0002-public-launch-gap-analysis.md) | Review Findings | Public-launch gap audit at c14955f3 against HoBo's own launch criteria (readiness dashboard, go/no-go, blocker taxonomy), with a prioritized critical path. |
| [`0003-engineering-build-plan.md`](./0003-engineering-build-plan.md) | Implementation Plan | Buildable engineering specs sharpening the production-build backlog's S1→S3 skeletons: 27 work items, dependency phases, and the three executable stage gates to first real cloud deploy and agent-via-MCP. |
| [`0004-main-gate-repair.md`](./0004-main-gate-repair.md) | Maintenance Note | Repair record for the red main gate: pnpm-lock.yaml drift, the 99-file Biome format backfill, the account-level Actions outage, and the undeclared-workspace-dependency fixes that restored the package build/test lanes. |
| [`0005-unimplemented-features-remediation.md`](./0005-unimplemented-features-remediation.md) | Implementation Plan | Full-repo audit at 3f73928 of documented-but-unimplemented features and claims, with a phased remediation plan: CI/guard integrity, doc-truth reconciliation, gate hardening, flagship features (TS bindle loader, live IaC, MCP server), examples, and proof-backfill sequencing. |
| [`production-build-backlog.md`](./production-build-backlog.md) | Implementation Plan | HoBo v1 Production Build — staged Linear scope. |
| [`proof-hardening-backfill.md`](./proof-hardening-backfill.md) | Implementation Plan | Backfill waves bringing the grandfathered draft proofs to the hardened artifact standard. |

## Conventions

- New plans take the next free zero-padded `NNNN-slug.md`.
- Every plan doc carries OKF frontmatter with a non-empty `type:`.
- This `index.md` stays a bare directory listing with no frontmatter (run `pnpm run docs:okf`).
