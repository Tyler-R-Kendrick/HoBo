---
type: Plan
title: "anti-slop SDLC state"
description: "Stacked PR chain for vendoring dmmulroy/anti-slop and gating it on changed files."
tags: [hobo, sdlc, anti-slop, oxlint]
---

# anti-slop — stack state

```text
main
 └── sdlc/anti-slop-01-vendor      #1179 plugin, skill mirrors, oxlint 1.79, lint:slop:changed
  └── sdlc/anti-slop-02-precommit  #1180 relevant-check-policy + tests
   └── sdlc/anti-slop-03-scripts-warnings  #1185 ignore agent-skill dirs; scripts/lib/inspectable
    └── sdlc/anti-slop-04-test     #1187 root competitor/council tests
     └── sdlc/anti-slop-05-examples  #1192 examples/ oxlint-clean
      └── sdlc/anti-slop-06-site     site/ oxlint-clean (json-inspect helper)
```

Full-repo `pnpm run lint:slop` stays opt-in (large backlog). Pre-commit and
`agent:check` run `lint:slop:changed` on touched TS/JS with `--deny-warnings`.
Skill-tree edits now also select `skills:mirror-check`.

## Next slices (file-complete, not warning-only)

The changed-file gate lints the **whole file**. A warning-only pass over
`scripts/` fails because those files still carry anti-slop errors. Current
`scripts/` count: 127 errors / 16 warnings (57 files). Highest error counts:

- `require-safety-comment-for-type-assertion`
- `no-runtime-typeof`
- `no-known-value-widening`
- `no-unsafe-dictionary-type`

Each follow-up PR should take **one file (or a tight cluster) to zero
findings**, then stop. Do not edit a file that still has other anti-slop
errors.

Cleared: entire `scripts/` tree (layer 3). Layer 4: root competitor/council tests.
Layer 5: `examples/` oxlint-clean (named JsonValue parse boundaries,
UsageReader returns, Firecrawl client injection instead of `vi.mock`).
Layer 6: `site/` oxlint-clean (`site/src/lib/json-inspect.ts`). Next:
`packages/` / `src/draft/` file-complete slices. Full-repo
`lint:slop --deny-warnings` is still red until those land.
