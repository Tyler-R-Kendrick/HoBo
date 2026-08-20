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
      └── sdlc/anti-slop-06-site     #1193 site/ oxlint-clean (json-inspect helper)
       └── sdlc/anti-slop-07-connectors  #1195 connectors + ci-guard + manifest-plan
        └── sdlc/anti-slop-08-data       #1197 @hobo/data
         └── sdlc/anti-slop-09-recipes   #1199 @hobo/recipes
          └── sdlc/anti-slop-10-mcp      #1202 @hobo/mcp + cloud gateway
           └── sdlc/anti-slop-11-providers-small  #1203 config/agentv/cedar/opa/ax/blacksmith
            └── sdlc/anti-slop-12-providers-runners  #1204 depot + flux
             └── sdlc/anti-slop-13-providers-github-lakebed  #1205 github + lakebed
              └── sdlc/anti-slop-14-providers-railway-convex  railway + convex
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
Layer 6: `site/` oxlint-clean (`site/src/lib/json-inspect.ts`).
Layer 7–10: connectors, data, recipes, mcp.
Layer 11: smallest provider packages (config, agentv, cedar, opa, ax,
blacksmith).
Layer 12: runner-depot + provider-flux.
Layer 13: runner-github + provider-lakebed.
Layer 14: provider-railway + provider-convex. Next: remaining
`packages/providers/*` (cloud majors), then `packages/code`, `hobo`,
`core`, `broker`, `src/draft/`. Full-repo `lint:slop --deny-warnings`
is still red until those land.
