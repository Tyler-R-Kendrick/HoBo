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

## Package build/test breakage — RESOLVED (undeclared workspace dependencies)

The third failure layer originally looked like missing `@hobo/wit` codegen
output (`@hobo/runtime` build: `src/wit.ts(20,8) TS2307` on the generated
bindings path). The follow-up fix disproved that hypothesis: `pnpm --filter
@hobo/wit run wit:check` reports all 34 generated declaration files **in sync**
— nothing needed regenerating. The real root cause was that the verb-wiring
changes added cross-package imports **without declaring the workspace
dependencies**, so pnpm never linked the packages into consumers'
`node_modules` (the same disease as the lockfile drift above, at the next
layer down). Fixed by declaring:

- `@hobo/runtime` → `@hobo/wit` (**dependencies**; its public d.ts re-exports
  the generated types via a `node_modules`-relative path).
- `@hobo/cli` → `@hobo/bindles`, `@hobo/cloud` (**dependencies**; the
  `UpResult` "type errors" in `up.ts` were pure cascade — with `@hobo/cloud`
  unresolved, `OrchestratorStatus` degraded to `any` and broke the
  discriminated-union narrowing).
- `@hobo/cli` → `@hobo/data`, `@hobo/provider-cloudflare`,
  `@hobo/runtime-local` (**devDependencies**; test-only imports).
- `@hobo/provider-cloudflare` → `@hobo/iac-pulumi` (**devDependencies**; its
  `pretest` already built it but the bare specifier could not resolve).
- `@hobo/runtime`'s actor test now imports `@hobo/runtime-local`'s dist via a
  **relative sibling path** built by `pretest`, because declaring even a
  devDependency closes the package cycle
  `conformance → runtime → runtime-local → conformance`, which Turbo rejects.

After the fixes the full affected lane is green: 31/31 Turbo tasks (builds and
tests for bindles, cli, cloud, conformance, contracts, data, events, hobo,
iac-pulumi, identity, mcp, provider-cloudflare, runtime, runtime-local), plus
whole-workspace `pnpm run build` (25/25) and `pnpm run typecheck` (40/40).
`docs:okf` still has four known-failing proof READMEs, already recorded in
`AGENTS.md`.

Follow-up guardrails worth considering (not done here): add `lint:code` to the
merge-blocking main gate or to `check:all`, so formatting drift cannot
accumulate silently while other lanes are red; and make the merged result of
package PRs re-run `install:check` so lockfile drift cannot land on `main`.
