# Review implementation evidence (ADR-0154)

## Requirements mapped

| Requirement | Surface |
|---|---|
| Versioned command/snapshot | `hobo.code.review-command/v1`, `hobo.code.review-snapshot/v1` |
| Separate aggregate | EventStore partition `hobo-code-reviews`, stream `code-review:<id>` |
| Semantic pageable diffs | `git-review-source.ts`, `unified-diff-parser.ts`, signed cursors |
| Generations + re-anchor | `review-anchors.ts`, `refreshReview` |
| Threads / coverage | `createReviewThread`, `markReviewCoverage` |
| GitHub provider | `github-review-provider.ts` (fake + `gh api`) |
| Exact-effect | `reviewEffectDigest` + authorize hook + HEAD revalidation |
| Terminal | `renderReviewPane`, `/review`, `hobo-code review` |
| Persistence recovery | EventStore snapshot + replay; duplicate command IDs are idempotent |
| Partial patch | `stageReviewSelection` / `unstageReviewSelection` via argv-safe git |
| Hostile input | cursor HMAC, path `..` reject, display sanitization, body 64KiB cap |

## Tests

`packages/code/test/review.test.ts` — parse, CAS, cursors, unified diff, real temporary Git repository start/mark/thread/prepare/publish/idempotent replay/stale revision.

## Threat model

- No shell interpolation of Git args.
- Cursors cannot carry repository paths.
- Agent findings stay `PRIVATE` until selected for a pending review.
- Publish re-reads HEAD after approval.

## Validation

```sh
pnpm exec vitest run test/review.test.ts --dir packages/code
pnpm --filter @hobo/code test
```
