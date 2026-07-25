---
type: Implementation Plan
title: "Unimplemented features and claims — remediation plan"
description: "Full-repo audit (2026-07-25, HEAD 3f73928) of features, capabilities, and claims that are documented or advertised but not fully implemented, with a phased plan to close each gap: CI resurrection, doc-truth reconciliation, gate-integrity hardening, flagship feature completion (TS bindle loader, live IaC lane, runnable MCP server), missing examples, and the proof backfill."
tags: [hobo, plans]
---

# Unimplemented features and claims — remediation plan

> Baseline audited at commit `3f73928` (2026-07-25) across `packages/` (27 packages, ~44k src
> LOC), `.github/workflows/`, `src/draft/` (648 proof packages), `docs/`, `site/`, and the agent
> tooling surface. Companions: [`0003-engineering-build-plan.md`](./0003-engineering-build-plan.md)
> (now stale in §2 — see F-2), [`0004-main-gate-repair.md`](./0004-main-gate-repair.md),
> [`proof-hardening-backfill.md`](./proof-hardening-backfill.md), and the IMPL register in
> [`GAPS.md`](../../GAPS.md).

## 1. Context

The repo has crossed a threshold its own documentation has not caught up with: all 27 CLI verbs
are wired (`5d6c386`), S2/S3 packages (`cloud`, `identity`, `mcp`, `contracts`, `iac-pulumi`,
`providers/*`) exist with real tested code, and the data-model conventions (proto+CUE in every
package's `data-models/`) are honored 27/27. The audit therefore found **two distinct kinds of
gap**, and they point in opposite directions:

1. **Under-claiming (docs lag code):** `README.md` still describes a 7-package "scaffold" with
   "Product implementation: not shipped"; `hobo <verb> --help` prints "Status: not yet
   implemented" for verbs that work; `0003`'s "Missing/Greenfield" table lists six packages that
   now exist.
2. **Over-claiming (claims lag reality):** the published site teaches `src/bindle.ts` → `hobo up`,
   but the CLI reads only `hobo.bindle.json` and `collect`/`dev` operate on a **hardcoded
   hello-bindle fixture**; the site imports `@hobo/junctions` (no such package); MCP is advertised
   as a control surface but `@hobo/mcp` has no `bin` and no dependents; the "gate-enforced" proof
   system grandfathers 647/648 packages so its gates **cannot fail**; the architecture guard runs
   vacuously in `main-gate`; and GitHub Actions has been structurally dead since ~2026-07-17.

This plan enumerates every verified gap and stages the work. Phases are dependency-ordered;
items within a phase are independent. Each item is sized for a single one-shot issue
(`.claude/skills/sdlc/references/linear-planning.md`) unless noted.

## 2. Phase 0 — Resurrect the truth-telling machinery (blocking)

Nothing downstream is trustworthy until CI actually runs and the gates can actually fail.

| # | Gap (verified) | Fix |
|---|---|---|
| 0-1 | **GitHub Actions structurally dead** — every run fails in 3–6s with `runner_id: 0` ([`0004-main-gate-repair.md`](./0004-main-gate-repair.md)). | **Owner action, outside the repo:** check Settings → Billing → Actions spending limit. Everything in Phase 2 assumes this is done. |
| 0-2 | **Architecture guard is a no-op in `main-gate`.** `.github/workflows/hobo-ci.yml:130` runs `pnpm run architecture:guard` with no `--base` after a fresh checkout; `changedFiles()` in `scripts/check-architecture-guardrails.mjs` sees an empty diff and exits 0 having checked nothing. Same for the bare invocation in `check:all`. | Add a `--all` mode to the guard that evaluates every production package, and use it in `main-gate` and `check:all`; keep diff mode for `agent:check --base=…`. |
| 0-3 | **Existing packages are permanently grandfathered by the guard.** `filterExistingBasePackages()` drops any package that existed at the base ref, so in PR mode only brand-new packages are ever checked. | After 0-4 lands (violations fixed), remove or invert the grandfather filter so changed files in existing packages are checked too. |
| 0-4 | **10 latent guard violations exist today** when the guard is forced over all 27 packages: `parallel-proto-type` in `camps`, `ci-guard`, `contract-harness`, `stage-gate`; `missing-pact-contract`/`missing-parse-derived-type`/`missing-event-architecture`/`missing-contracts-pact` in `componentize`; `missing-parse-derived-type`/`missing-event-architecture` in `wit`. | Fix each violation (see 3-1 for componentize's PACT). The `parallel-proto-type` hits mean a hand-declared TS interface duplicates a proto message — replace with the generated/derived type per AGENTS.md parse-don't-validate rules. |
| 0-5 | **`main-gate` never fires on push to main.** `hobo-ci.yml:105` gates on `github.event_name == 'push'` but the workflow declares no `push` trigger (`hobo-ci.yml:3-12`). | Either add the `push: branches: [main]` trigger or delete the dead clause; pick one intentionally (merge_group already covers the merge path). |
| 0-6 | **`main-gate` omits the draft gates.** `check:all` (root `package.json`) does not include `draft:artifacts`, `draft:cascade`, `skills:mirror-check`, `promotions:check`, `case:check` — those run only via `agent:check` diff mode. | Add the draft/skill gates (full-repo mode) to `check:all` or as a separate `main-gate` step. |
| 0-7 | **Two CI jobs reference a nonexistent fixture.** `fixtures.yml:97` and `:129` set `HOBO_E2E_FIXTURE: examples/multi-cloud-shop`; only `examples/hello-bindle` exists. Label/schedule gating has hidden the guaranteed failure. | Short term: disable/skip both jobs with a comment pointing at 5-2. Long term: 5-2 builds the example. |
| 0-8 | **Duplicated fixture lanes on the same cron.** `examples-e2e.yml` and `fixtures.yml` both define `hello-bindle-fixture` + quarantine jobs on cron `17 3 * * 1`; one calls migrated `packages/ci-guard/bin/*` scripts, the other the old `src/draft/technical-proofs/ci-fabric-oidc-e2e-contract/scripts/*`. Unfinished migration. | Finish the migration: keep the `ci-guard` lane, delete the draft-proof lane from `fixtures.yml`, and update the stale draft contract fixture (see 2-6). |
| 0-9 | **`lint:code` is not merge-blocking** — how 99 files of Biome drift merged (already recommended by `0004:77`). | Add `lint:code` to the PR gate (`agent:check` policy or an explicit `pr-gate` step). |

## 3. Phase 1 — Truth reconciliation (docs say what the code does)

Cheap, high-leverage; all items are doc/text edits with no behavior change. Can run parallel to
Phase 0.

| # | Gap (verified) | Fix |
|---|---|---|
| 1-1 | **README understates the repo.** `README.md:7` lists 7 packages as a "scaffold"; there are 27. `README.md:174` says "Product implementation: not shipped" while all 27 verbs are wired. | Rewrite the "Current state" callout and status section: 27 packages, all verbs wired against the local/in-memory lane, live-cloud lanes credential-gated, honest scope limits linked. |
| 1-2 | **README's only broken link + self-contradiction.** `README.md:55` says the site is "deployed by `deploy-pages.yml`" — the workflow does not exist, and `README.md:155` correctly says the site is pushed to `gh-pages` manually. | Fix line 55 to match line 155. |
| 1-3 | **Stale CLI help.** `packages/cli/src/shell/verbs.ts:238` prints `Status: not yet implemented` for every verb except `new`/`stub`/`codegen`, but `packages/hobo/src/cli.ts` wires 21 more. | Make the status line reflect the registry at render time (a verb wired with a non-stub handler reports implemented; stubs keep the current text). Test: help output for `up` vs an unwired composition. |
| 1-4 | **Site teaches an unwired flow and nonexistent packages.** `site/` documents `src/bindle.ts` → `hobo up`, `import { junction } from "@hobo/junctions"` (`site/src/pages/primitives/junctions.md` et al.), `@hobo/provider-fly`, `@hobo/runtime-postgres`; `site/src/pages/agents/mcp.md:8` claims a running MCP control plane "with full capability parity". | Until 4-1/4-3 land: re-scope the site to the real surface (`hobo new` + `hobo.bindle.json`, existing packages only), and mark Junctions/second-provider/MCP-server pages as design-stage. When 4-x lands, restore present tense. |
| 1-5 | **AGENTS.md cites two nonexistent scripts** (`scripts/check-targeted.mts`, `scripts/agent-standards-hook.mts` at AGENTS.md:141-143); the `test:smoke` caveat says the lane runs `bun` (it runs vitest); CLAUDE.md says "nine agent tools" while AGENTS.md:3 says "twelve". | Correct all three; make the tool count a single sourced number. |
| 1-6 | **`0003-engineering-build-plan.md` §2 baseline is stale** — lists `@hobo/data`, `@hobo/events`, `packages/cloud`, `identity`, `mcp`, `hobo dev`, `hobo collect` as Missing/Greenfield; all exist now, and `s1-stage-gate.yml` now runs production packages. | Add a re-baseline banner + corrected table (do not rewrite history; append a "2026-07-25 re-baseline" section). |
| 1-7 | **63 broken relative links in `docs/`**, three clusters: `docs/technologies/` → pre-rename design docs (~30, e.g. `../design/event-model.md` → `data-plane.md`, old 6-file ADR set → consolidated 4), `docs/design/proofs/*/index.md` → renamed/removed draft proofs (5), `docs/plans/0000|0001` path-depth errors (~10). | Fix the links; then extend the link linter to cover `docs/technologies/` and `docs/plans/` (see 2-7). |
| 1-8 | **`docs:okf` known-failing** on 4 `docs/design/proofs/*/README.md` files missing OKF frontmatter (AGENTS.md:300, still outstanding per `0004:74`). | Add the frontmatter; remove the known-failure note. |
| 1-9 | **8 packages have no README**: `core`, `stage-gate`, `schema-tools`, `camps`, `training-pipeline`, `componentize`, `providers/provider-ax`, `providers/provider-agentv`. | One-paragraph README each: purpose, honest scope, gate commands. |
| 1-10 | **Dead `packages/build/` config in three places**: `pnpm-workspace.yaml` glob, `konsistent.json` `nested-package-scaffolding`, `check-architecture-guardrails.mjs:39` `NESTED_PRODUCTION_CATEGORIES` — the directory does not exist (GAPS IMPL-008 covers `iac/*` which now exists; `build/*` remains). | Either scaffold `packages/build/` when its slice lands or remove the three references and the IMPL-008 residue. |

## 4. Phase 2 — Gate integrity (make "gate-enforced" true)

The draft/proof gate system and the skill/behavior lanes are currently incapable of failing.

| # | Gap (verified) | Fix |
|---|---|---|
| 2-1 | **Draft gates are structurally inert.** `src/draft/_grandfathered.json` lists 647 of 648 packages; `scripts/check-draft-artifacts.ts` downgrades them to advisory; every aggregator in `scripts/check-proof-cascade.ts` is grandfathered so `failures` can never increment. The only non-grandfathered package already passes. | The burn-down is already planned in [`proof-hardening-backfill.md`](./proof-hardening-backfill.md) (W1–W6, 647→0); **no wave has landed**. Start W1 (proof.json bootstrap, ~30 batches). This plan does not duplicate that document — it schedules it. |
| 2-2 | **`test:behavior` is a phantom lane.** Only 1/26 epics has executable features (`finops-budget-routing-control-plane`); `scripts/relevant-check-policy.ts:165-167`'s `behaviorChanged` predicate is dead code — `touched(["features"])` is a repo-root prefix match that can never match `src/draft/epic-proofs/*/features/`, and the `/cucumber\.config\./` regex never matches `cucumber.yaml`; no workflow runs `test:behavior` at all. | Fix the predicate (match `/\/features\//` path segments + `cucumber.yaml`); add `test:behavior` to `check:all` or `main-gate`; W2 of the backfill promotes the other 25 epics. |
| 2-3 | **Orphaned feature file.** `src/draft/projects/s6-06-finops-plane/features/finops-plane.feature` is outside the cucumber glob (`src/draft/epic-proofs/*` only) and has no steps — executed by nothing. | Either widen the glob to the projects layer and add steps, or move/remove the file with a note in the project README. |
| 2-4 | **Skill mirrors drift unchecked.** `scripts/check-skill-mirrors.ts` guards only `draft`, `repo`, `sdlc` of ~47 mirrored skills; `.agents/skills/` already contains 7 caveman skills absent from `.claude/skills/` — while CLAUDE.md declares caveman "active by default" and AGENTS.md documents `/caveman*` slash commands that don't resolve in Claude Code. | Extend the mirror check to all shared skills (or an explicit manifest); mirror the caveman skills into `.claude/skills/` or correct the "active by default" claim. |
| 2-5 | **Repo skill gates are Windows-hardcoded.** `.claude/skills/repo/references/gates.md:28` (mirrored in `.agents/`) prescribes `py -3 C:\Users\conta\...quick_validate.py` and `pnpm.cmd` (10 occurrences) — unusable on Linux/macOS. | Replace with portable invocations (`pnpm`, repo-relative script paths). |
| 2-6 | **A declared-blocking check runs nowhere.** `src/draft/technical-proofs/ci-fabric-oidc-e2e-contract/src/ci-fabric-contract.ts:15` declares `node --import tsx scripts/validate-traceability.ts` a required blocking PR command; no script/workflow/hook invokes it. The same fixture lists `npm ci`/`npm test` while real CI is pnpm + `agent:check`. | Update the draft contract to mirror the enforced `packages/ci-guard/bin/assert-ci-contract.ts` reality; decide whether `validate-traceability` joins a real lane or is descoped. |
| 2-7 | **Link lint coverage gap.** `docs/index.md:35` claims relative links pass `docs:design-lint`, but the 63 breaks in 1-7 show the linter does not cover `docs/technologies/` or `docs/plans/`. | Extend the linter's directory coverage after the 1-7 cleanup so it stays clean. |
| 2-8 | **`--passWithNoTests` masks glob regressions** in `ci-guard`, `cli`, `componentize`, `conformance`, `core`, `hobo` — all six have tests today, so a vitest config regression would pass silently. | Remove the flag from packages that have tests. |
| 2-9 | **Prose-regex guard checks are trivially satisfiable** — `hasParseDerivedTypes` greps for the literal phrase "parse, don't validate"; `hasEventArchitecture` greps vocabulary words. | Acceptable as doc-presence checks, but document that explicitly in the guard header so nobody mistakes them for behavioral verification; optionally strengthen `parallel-proto-type` (the one real AST-ish check) after 0-4. |
| 2-10 | **Orphaned scripts.** `scripts/migrate-to-vitest.ts` (zero references), `scripts/migrate-exp-proofs.ts` (one-time, done). | Delete, or move under a `scripts/archive/` with a note. |

## 5. Phase 3 — Flagship feature completion (close the site's promises)

These are the real "unimplemented features" — code the docs/site promise that doesn't exist yet.
Each is a proper sdlc slice with contracts, proto+CUE, PACT, and tests per AGENTS.md.

| # | Feature | Current honest scope | Slice |
|---|---|---|---|
| 3-1 | **TypeScript bindle loader** — the flagship authoring flow. | `packages/cli/src/cloud/manifest.ts:13` reads only `hobo.bindle.json`; `packages/hobo/src/compose.ts:296` admits `collect`/`dev` use a hardcoded hello-bindle (`createDefaultCollectionTarget`, `createDefaultDevRuntime`). | Build the loader that materializes a collection target from a project's `src/bindle.ts` (run-to-collect via `compileBindleManifest`, which already exists in `packages/bindles`), wire it into `collect`, `dev`, `up`, `plan`; keep `hobo.bindle.json` as the compiled artifact. This unblocks re-promoting the site tutorial (1-4). Emits the unemitted `bindle.ResourcesCollected`/`bindle.ManifestProduced` events (0003 S1-12). |
| 3-2 | **Live IaC lane.** | `packages/iac/iac-pulumi/src/iac-pulumi-automation-adapter.ts:187` is a self-declared "local, deterministic stand-in"; the default deploy lane's backend is in-memory (`compose.ts:58`); Vercel/Cloudflare clients are credential-gated with mocked default transports. | Implement the real Pulumi Automation API backend behind the existing `IacProvider` port (adapter swap, no port change); exercise it in the existing `workflow_dispatch` + credential-gated lanes (`deploy-hello-bindle-vercel.yml` pattern) so the live path runs at least manually. S2-09 gate evidence comes from this. |
| 3-3 | **Runnable MCP server.** | `packages/mcp` has a real tool surface derived from `CANONICAL_VERBS` but no `bin` entry and no dependents — nothing serves it, while `site/src/pages/agents/mcp.md:8` claims a live control plane. | Add a `bin/hobo-mcp` entry composing the tool surface over stdio, wired to the same composition root as `packages/hobo`; contract tests for tool-list parity with the verb registry (parity check already structurally exists). |
| 3-4 | **`hobo import` live estate discovery, `hobo derivative` upcaster execution, `hobo drift` live backend.** | All three are honest-scope stubs: `import-command.ts:24` adopts only the declared bindle; `derivative-command.ts:65` reports rather than executes; `drift-command.ts:37,66` has nothing to drift in-memory. | Staged behind 3-2 (they need a live backend to be meaningful). Keep as three separate slices; until then the help text (1-3) should state the scope. |
| 3-5 | **Junctions.** | Design-only. `README.md:32` core idea, site documents `@hobo/junctions`; no package exists. This is S4 scope (multi-cloud) per the backlog. | Do **not** build now. 1-4 re-scopes the site; the backlog's S4 stages own the implementation. Decision recorded here so the gap is deliberate, not forgotten. |
| 3-6 | **Trajectory capture (GAPS IMPL-003)** — OTel/OpenInference span emission for agent actions. | Unbuilt. | Schedule with the S3 identity/audit surface; depends on none of the above. |

## 6. Phase 4 — Examples, thin packages, coverage

| # | Gap | Fix |
|---|---|---|
| 4-1 | **3 of 4 promised examples missing.** `production-build-backlog.md:22` promises `hello-bindle`, `multi-cloud-shop`, `durable-agent`, `self-host-yard`; only the first exists (and two CI jobs already reference the second — 0-7). | Build `multi-cloud-shop` first (unblocks the fixture jobs); `durable-agent` second (its draft proof `durable-agent-primitive-contract` has fixtures to promote); `self-host-yard` last (needs 3-2). |
| 4-2 | **`packages/schema-tools` test coverage**: 967 src LOC, 1 test file — thinnest ratio in the repo, and it's the codegen driver everything's proto/CUE story depends on. | Add tests around the buf/protoc-gen-es pipeline and CUE emission (golden-file style, matching `packages/bindles` fixtures). |
| 4-3 | **Thin packages**: `yards` (72 LOC), `componentize` (388 LOC, no PACT — also 0-4), `training-pipeline`, `provider-ax`, `provider-agentv`. | Grow only when their slices demand it; the immediate work is 0-4's contract/doc backfill so they pass the guard honestly. |
| 4-4 | **`event_envelope.{cue,proto}` duplicated** in `core` and `runtime-local` data-models (GAPS IMPL-009, deferred). | Single-source via schema-tools generation once 4-2's tests exist to protect the move. |
| 4-5 | **JS-family policy violated by the repo's own example** (`examples/hello-bindle/deploy/**/*.{mjs,js}` vs AGENTS.md:120-128, which requires an ADR for exceptions). | Record the deploy-artifact exception in an ADR (they're platform entry files), or convert to TS build outputs. |

## 7. Phase 5 — Proof backfill execution

[`proof-hardening-backfill.md`](./proof-hardening-backfill.md) already stages W1–W6 with
`src/draft/_grandfathered.json` (647 entries) as the burn-down metric. Zero waves have landed.
This plan adds only sequencing: **W1 (proof.json bootstrap) and W2 (executable epic features)
should start immediately after Phase 0**, because they are what make gates 2-1 and 2-2 real;
W3–W6 follow the existing wave order via sdlc dispatch.

## 8. Sequencing summary

```
Phase 0 (CI + guard integrity)  ──┬──> Phase 2 (gate integrity)  ──> Phase 5 (backfill W1–W6)
Phase 1 (doc truth)  [parallel] ──┘
Phase 0 ──> Phase 3: 3-1 loader ──> re-promote site tutorial (closes 1-4's temporary re-scope)
            3-2 live IaC ──> 3-4 import/derivative/drift, 4-1 self-host-yard
            3-3 MCP server (independent)
Phase 4 items are independent except where noted (4-1 after 0-7 short-term skip; 4-4 after 4-2).
```

Priority order if resources are serial: 0-1, 0-2/0-3/0-4 (guard), 1-1/1-2/1-3 (README+help),
1-4 (site re-scope), 3-1 (loader), 2-1/2-2 (gates real, W1/W2), 3-2 (live deploy), 3-3 (MCP),
then the rest.

## 9. Verification

- **Phase 0:** a PR touching an existing package with a deliberate guard violation must fail
  `agent:check`; `pnpm run architecture:guard -- --all` must pass on main after 0-4; `main-gate`
  must show non-vacuous guard output in its log; the `fixtures.yml` multi-cloud jobs no longer
  reference a missing path.
- **Phase 1:** `pnpm run docs:okf`, `docs:design-lint` (extended), and `konsistent` green;
  `hobo up --help` no longer claims "not yet implemented"; zero broken relative links under
  `docs/` (spot-verify with the extended linter).
- **Phase 2:** deleting a step-definition file must trip `behaviorChanged` in
  `scripts/relevant-check-policy.ts` (unit test the predicate); `pnpm run test:behavior` runs in
  `main-gate`; `skills:mirror-check` fails when a mirrored skill diverges (add a fixture test).
- **Phase 3:** an end-to-end test where a fresh project with only `src/bindle.ts` runs
  `hobo collect && hobo plan && hobo up` against the local lane; the credential-gated live lane
  deploys hello-bindle via real Pulumi in a `workflow_dispatch` run; `hobo-mcp` serves a
  tool list that a parity test matches against `CANONICAL_VERBS`.
- **Phase 5:** `src/draft/_grandfathered.json` count strictly decreases per landed batch;
  `pnpm run draft:artifacts` and `draft:cascade` green with advisories shrinking.

## 10. Execution record (2026-07-25)

All phases executed on `claude/unimplemented-features-analysis-sdimj6` (PR #878) the same day
the plan landed. Status by item:

- **Phase 0** — done. Guard `--all` mode wired into `check:all` + main-gate; grandfather filter
  removed; the 10 latent violations fixed; dead push clause removed; draft/skill/behavior gates in
  `check:all`; superseded draft fixture lanes deleted; `lint:code` in the PR gate. 0-1 (Actions
  account outage) remains **owner-side**: Settings → Billing → Actions spending limit.
- **Phase 1** — done. README/AGENTS/CLAUDE reconciled; CLI help derives status from the registry;
  63 broken links fixed and the linter's coverage extended; seven package READMEs added; 0003
  re-baselined (§8); `packages/build` references removed; site re-scoped to implemented reality.
- **Phase 2** — done. Behavior predicate fixed + policy tests; s6-06 feature made executable and
  the projects layer joined the cucumber glob; skill-mirror gate covers all 53 shared skills and
  caveman is mirrored; repo skill de-Windowsed; draft CI contract mirrors the enforced gate
  (validate-traceability descoped); `--passWithNoTests` removed; orphaned scripts retired.
- **Phase 3** — done. 3-1 TypeScript bindle loader (collect/dev/plan/up from `src/bindle.ts`;
  `hobo dev` serves the project's own handler). 3-2 real pinned Pulumi CLI engine behind the
  adapter seam, `HOBO_PULUMI_LIVE=1` selection, credential-gated `deploy-hello-bindle-pulumi`
  lane. 3-3 runnable `hobo-mcp` stdio binary with verb parity contract-tested. 3-4 stays staged
  behind live-lane usage as planned; 3-5 Junctions remains deliberately deferred to S4; 3-6
  trajectory capture stays scheduled with the S3 identity/audit surface.
- **Phase 4** — done. `multi-cloud-shop`, `durable-agent`, and `self-host-yard` examples;
  schema-tools 8 test files / 56 tests; `event_envelope` single-sourced with a drift-guarded
  mirror (IMPL-009 resolved); ADR-0126 records the deploy-artifact JS exception.
- **Aftermath of Phase 0** — wiring `check:all` to actually run everything surfaced five more
  latent failures that were red on `main` under dead CI: the bindles API-freeze fixture missing
  the catalog's `cache` factory, a missing `cache` local-Camp equivalent, a scaffold test
  outrunning the default timeout under full-suite load, two cwd-dependent artifact tests, and a
  test-only adapter→adapter dependency (`provider-cloudflare` → `iac-pulumi`, merged as #868
  during the blackout) whose conformance test now lives in the composition root where both
  adapters are legal imports. All fixed; `check:all` runs green end to end.
- **Phase 5** — W1 done (647 schema-validated manifests via
  `scripts/backfill-proof-manifests.mts`; the sweep also cleared 303 latent parallel-type
  declarations and taught the guard to skip frozen promoted proofs). W2 done (all 26 epics carry
  executable Gherkin; `test:behavior` runs 98 scenarios / 352 steps). W3–W6 proceed via sdlc
  dispatch per [`proof-hardening-backfill.md`](./proof-hardening-backfill.md);
  `_grandfathered.json` stays the burn-down (entries delete when a package completes its last
  wave).
