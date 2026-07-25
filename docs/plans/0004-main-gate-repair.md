---
type: Maintenance Note
title: "Main gate repair: lockfile sync + Biome format backfill"
description: "Repairs the two pre-existing failures that made every PR gate red on main: a pnpm-lock.yaml drifted behind workspace dependency declarations, and 99 Biome formatting errors accumulated while the install step was failing."
tags: [hobo, maintenance]
---

# Main gate repair: lockfile sync + Biome format backfill

Recorded 2026-07-25 while landing the GitHub Pages site (branch
`claude/hobo-github-pages-site-t22v0i`). Two pre-existing failures on `main`
made the PR impact gate red for any branch, so they are repaired first in their
own commit:

1. **Lockfile drift.** Workspace packages (for example `@hobo/contracts` adding
   `@hobo/core` and `@hobo/policy` dependencies, plus `packages/cloud` wiring)
   merged without regenerating `pnpm-lock.yaml`, so
   `pnpm install --frozen-lockfile` — the first step of every CI lane and of
   `install:check` — failed with a specifier mismatch. The regenerated lockfile
   delta is importer entries with pure `workspace:` → `link:` additions across
   nine packages; no external dependency resolutions changed.
2. **Biome format backfill.** With the install step failing, the
   `lint:code` lane (selected whenever source or automation changes) had no
   green baseline, and 99 files under `packages/`, `scripts/`, `src/`, and
   `test/` accumulated formatting drift. `pnpm run lint:code:fix`
   (`biome format --write`) was applied; the changes are formatting-only.

## Root cause of the silent drift: Actions runs never reach a runner

Discovered after opening PR #867: **every** GitHub Actions run in this
repository — on `main` and on PRs — has been completing as `failure` in
**3–6 seconds with `runner_id: 0` and no logs produced** since at least
2026-07-17 (verified across hobo-ci runs #1582–#1589, including `main`'s
scheduled run #1588 on 2026-07-20). Jobs are killed before a runner is
assigned, which is the signature of an **account-level Actions condition**
(spending limit reached, billing issue, or runner-group restriction), not a
workflow bug. This cannot be fixed from inside the repo; it needs the owner
to check **Settings → Billing → Actions spending limit** (or the runner
configuration). It also explains how the lockfile and formatting drift below
merged unnoticed: the gate has been structurally dead, so "CI failed" carried
no information.

## Known remaining breakage (pre-existing, out of scope here)

With the two repairs above, install, lint, docs, standards, and guard lanes
pass — but the **package build/test lanes are still red on pristine `main`**,
verified by stashing all local changes and running:

```text
pnpm --filter @hobo/conformance run build
  → @hobo/core build: src/wit.ts(20,8): error TS2307: Cannot find module
    '../node_modules/@hobo/wit/src/generated/runtime-primitives/interfaces/hobo-runtime-types.js'
```

`@hobo/core` cannot compile because `@hobo/wit` generated bindings are absent,
which cascades to `@hobo/runtime`, `@hobo/cli`, `@hobo/conformance`,
`@hobo/mcp`, and dependents' tests. Because `pnpm-lock.yaml` is a Turbo global
dependency, *any* PR that syncs the lockfile marks every package affected, so
the affected-package CI lanes cannot go green until this is repaired with the
owning codegen path (`pnpm --filter @hobo/wit run wit:gen` / `wit-lock.json`)
by whoever owns the recent verb-wiring changes. `docs:okf` also has four
known-failing proof READMEs, already recorded in `AGENTS.md`.

Follow-up guardrails worth considering (not done here): add `lint:code` to the
merge-blocking main gate or to `check:all`, so formatting drift cannot
accumulate silently while other lanes are red; and make the merged result of
package PRs re-run `install:check` so lockfile drift cannot land on `main`.
