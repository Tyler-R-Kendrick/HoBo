# HoBo plans

Directory listing for audit/review logs and improvement plans written to `docs/plans/` by the `/improve` tooling (per [`CLAUDE.md`](../../CLAUDE.md)).

## Documents

| File | Type | Purpose |
|---|---|---|
| [`0000-requirements-suite-review.md`](./0000-requirements-suite-review.md) | Review Findings | Historical `/improve` audit of the requirements suite at b3cf64d, reconciled with PR #1 review. |
| [`0001-scope-refactor-review.md`](./0001-scope-refactor-review.md) | Implementation Plan | Review-and-improve log for the Yard⊃Camp⊃Bindle scope refactor. |
| [`production-build-backlog.md`](./production-build-backlog.md) | Implementation Plan | HoBo v1 Production Build — staged Linear scope. |

## Conventions

- New plans take the next free zero-padded `NNNN-slug.md`.
- Every plan doc carries OKF frontmatter with a non-empty `type:`.
- This `index.md` stays a bare directory listing with no frontmatter (run `pnpm run docs:okf`).
