---
type: Reference
title: "SDLC dispatch log"
description: "Append-only outcomes for sdlc coordinator runs."
tags: [hobo, plans, sdlc]
---

## 2026-08-01 — OptimizeXP replayable evidence closeout (#1000)

- **PR:** https://github.com/Tyler-R-Kendrick/HoBo/pull/1000
- **scope:** replayable API/TUI/GUI evidence guidance, independent evidence review, verified experiment certificates, persona/scenario planning, and hobo-code empty non-TTY fail-closed entry
- **local gates:** staged `agent:check` green; @hobo/code 117 passed / 4 skipped; behavior 98 scenarios / 352 steps; `optimizexp:check` green
- **OptimizeXP:** run `20260801-hobo-code-optimizexp`; `assert-complete` and `mark-complete` green; stop `pareto-equilibrium`
- **status:** merged via squash commit `91ea7bdd1942575b372a1a740f3faf061ec54ff6`; CodeRabbit review was rate-limited because the inherited initiative diff exceeded its free file limit

# Dispatch log

Append-only outcomes for sdlc coordinator runs. Newest entries at the bottom.

---

## 2026-07-30 — sdlc-gh-stack

| Field | Value |
|---|---|
| Initiative | `docs/plans/sdlc-gh-stack/sdlc-state.md` |
| Backend | sequential-fallback (parent; skill/docs work, no implementer dispatch) |
| Issue | n/a (repo tooling / agent skill) |
| Branch | `feat/sdlc-gh-stack-skill` → `feat/sdlc-billing-merge-closeout` |
| PRs | #958 (merged); follow-up billing-merge wording PR |
| Result | **success** |
| Failure class | `billing-budget` on #958 checks only (did not block merge) |
| Notes | Installed `github/gh-stack`; expanded `sdlc` + `gh-stack` skills mirrored to all agents; bottom-up closeout + incremental checkins; clarified squash-merge still required when CI is billing-red. User confirmed agent can still squash-merge under billing failures. |

## 2026-07-31 — ax-optimizexp-land

| Field | Value |
|---|---|
| Initiative | `docs/plans/ax-optimizexp-land/sdlc-state.md` |
| Backend | sequential-fallback (parent; AX work already measured under optimizexp) |
| Issue | AX-01 land setup help + gbrain fail-closed |
| Branch | `sdlc/ax-optimizexp-land-01-setup-help-gbrain` |
| PRs | #968 (squash-merged `c37cf984`) |
| Result | **success** |
| Failure class | `billing-budget` on checks only (empty steps; spending limit annotation) |
| Notes | Local gates green (setup --help, gbrain launcher exit 1, bindings, mirrors, agent:check staged). Closeout rubber-duck + adversarial on PR comment. |


## 2026-07-31 — sdlc --finish skill

| Field | Value |
|---|---|
| Initiative | session land: `/sdlc --finish` skill flag |
| Backend | sequential-fallback (parent; skill/docs only) |
| Issue | n/a (agent tooling) |
| Branch | `feat/sdlc-finish-flag` |
| PRs | #971 |
| Result | **in progress → merge** |
| Failure class | (CI: expect billing-budget if empty steps) |
| Notes | Adds references/finish.md; dual-mirror skill; AGENTS/CLAUDE/docs pointers. |


## 2026-07-31 — ax doctor + cli-help rewire

| Field | Value |
|---|---|
| Initiative | optimizexp AX continue (doctor agent-tooling + cli-help rewire) |
| Backend | sequential-fallback (`/sdlc finish`) |
| Issue | n/a |
| Branch | `feat/ax-doctor-cli-wire` |
| PRs | #972 |
| Result | **merge** |
| Failure class | (expect billing-budget if empty-step CI) |
| Notes | doctor AUTH/MCP/setup; rewire cli-help-and-doctor off eval:agent:live; plateau runs ax-doctor + ax-cli-wire |


## 2026-07-31 — ax docs sections + WorkOS AUTH + exp-nav

| Field | Value |
|---|---|
| Initiative | optimizexp AX docs + AUTH attribution + exp-nav |
| Backend | sequential-fallback (`/sdlc finish`) |
| Branch | `feat/ax-docs-exp-nav-auth` |
| PRs | #973 |
| Result | **merge** |
| Failure class | (billing-budget if empty-step CI) |
| Notes | AX section map; WorkOS auth.md; rewire draft-exp-nav; discovery live demotion |


## 2026-07-31 — optimizexp all-exp + infinite passes

| Field | Value |
|---|---|
| Initiative | bare `/optimizexp` all-exp land via `/sdlc finish` |
| Backend | sequential-fallback (parent) |
| Branch | `feat/optimizexp-all-exp-finish` |
| PRs | [#974](https://github.com/Tyler-R-Kendrick/HoBo/pull/974) (squash-merged `10c57458`) |
| Result | **success** |
| Failure class | `billing-budget` on checks only (empty steps; jobs did not start) |
| Notes | Default `--passes` infinite; design-system → design:lint; demote gate:s1/docs:design-lint; run `20260731-all-exp` irreducible residual multi-gate agent:check F=1 L. Local agent:check staged + mirrors green. |


## 2026-07-31 — optimizexp Pareto delight + survey + persona v2

| Field | Value |
|---|---|
| Initiative | optimizexp equilibrium / delight / survey session land (`/sdlc finish`) |
| Backend | sequential-fallback (parent) |
| Branch | `feat/optimizexp-equilibrium-delight` |
| PRs | [#976](https://github.com/Tyler-R-Kendrick/HoBo/pull/976) (squash-merged `19a91d22`) |
| Result | **success** |
| Failure class | `billing-budget` (empty-step CI; no code execution) |
| Notes | Dual regime until pareto-equilibrium; cognitive thresholds; persona schema v2; survey.mts + backlog; local gates green. |


## 2026-07-31 — optimizexp all-eq delight (doctor + personas v2)

| Field | Value |
|---|---|
| Initiative | bare `/optimizexp` all-eq land via `/sdlc finish` |
| Backend | sequential-fallback (parent) |
| Branch | `feat/optimizexp-all-eq-delight` |
| PRs | [#978](https://github.com/Tyler-R-Kendrick/HoBo/pull/978) (squash-merged `a2c875c2`) |
| Result | **success** |
| Failure class | `billing-budget` (empty-step CI) |
| Notes | Doctor gbrain zero-key remediation; product-* schema v2; run 20260731-all-eq pareto-equilibrium. Local agent:check staged green. |


## 2026-07-31 — yard-first provider docs + devenv/Nix note

| Field | Value |
|---|---|
| Initiative | Yard-owned provider selection + optional Nix / devenv-first DevX (`/sdlc finish`) |
| Backend | sequential-fallback (parent; design suite docs) |
| Branch | `docs/yard-first-provider-devenv` |
| PRs | [#980](https://github.com/Tyler-R-Kendrick/HoBo/pull/980) (squash-merged `0c57c62b`) |
| Result | **success** |
| Failure class | `billing-budget` / checks still queued at merge (finish exception) |
| Notes | Design suite Camp→Yard-first language; `docs/design/devx-devenv-nix.md`; index + ADR-0006 links; camps package docs. Local `agent:check -- --staged` green. |


## 2026-07-31 — yard-first skeptic gaps + Nix posture expand

| Field | Value |
|---|---|
| Initiative | Yard-first + Nix/devenv goal — adversarial verification gap close |
| Backend | sequential-fallback (parent; design suite) |
| Branch | `docs/yard-first-skeptic-gaps` |
| PRs | [#982](https://github.com/Tyler-R-Kendrick/HoBo/pull/982) (squash-merged `1f0f8575`) |
| Result | **success** |
| Failure class | `billing-budget` / checks may still be queued at merge |
| Notes | ADR-0031 + platform-engineering + worked-example; expanded `devx-devenv-nix.md` (risks, hobo-code auto-detect, NixOS/Station, dendritic); camps residual documented; SCRATCH verification captures; camps tests 7/7; agent:check staged green. |


## 2026-07-31 — yard-first sdk-api/control-plane/wasm skeptic close

| Field | Value |
|---|---|
| Initiative | Yard-first + Nix goal — skeptic re-verify gaps on Plan-02 / Planner / wasm host |
| Backend | sequential-fallback (parent) |
| Branch | `docs/yard-first-sdk-api-fix` |
| PRs | [#984](https://github.com/Tyler-R-Kendrick/HoBo/pull/984) (squash-merged `446d4280`) |
| Result | **success** |
| Failure class | billing-budget / local main worktree cannot checkout |
| Notes | sdk-api resourceMappings + reject labels; control-plane Planner rewrite; wasm-runtime-wit Yard-owned infra; walkthrough bindings removed. provider-ownership-rg unlabeled hits empty. camps 7/7; agent:check staged green. |


## 2026-07-31 — yard-first inventory sweep (Camp-owns-provider)

| Field | Value |
|---|---|
| Initiative | Yard-first AC1 / provider-ownership gate — broad inventory one-pass |
| Backend | sequential-fallback (parent) |
| Branch | `docs/yard-first-inventory-sweep` |
| PRs | [#986](https://github.com/Tyler-R-Kendrick/HoBo/pull/986) (squash-merged `6a85628a`) |
| Result | **success** |
| Failure class | billing-budget / main worktree checkout local only |
| Notes | REWRITE=0 under broad patterns; sdk-api Runtime vs Providers; control-plane authoring provider; ADR-0090; secrets authoring + ADR-0027. SCRATCH inventory + rg. agent:check staged green. |


## 2026-07-31 — optimizexp hobo-code hermetic + stop-gate

| Field | Value |
|---|---|
| Initiative | Session land: optimizexp dual-regime closeout + hobo-code hermetic/durable for advanced-nix-devenv-developer |
| Backend | sequential-fallback (parent) |
| Branch | `feat/optimizexp-hobo-code-hermetic` |
| PRs | [#988](https://github.com/Tyler-R-Kendrick/HoBo/pull/988) (squash-merged `5f9c3199`) |
| Result | **success** |
| Failure class | `billing-budget` (S0 stage gate linux/windows empty steps ~3s; no runner work) |
| Notes | hobo-code `env` + hermetic-env + durable chrome; project persona/feature; assert-complete/mark-complete stop gate + tests; package 80/80; stop-gate 6/6; optimizexp run pareto-equilibrium. Turbo graph cycle pre-existing on main for `turbo --filter packages/code` (pnpm filter vitest green). |


## 2026-07-31 — hobo-code optimizexp surfaces session land

- Branch: `feat/hobo-code-optimizexp-surfaces`
- Work: persona + product surfaces for hobo-code optimizexp (agent, config, edit, harness, cost, guides, …)
- Finish: `/sdlc finish` — single PR squash-merge
- Package tests: @hobo/code vitest 104 passed
- Note: root turbo workspace cycle (@hobo/contracts↔core↔contract-harness) pre-existing; package filter tests green

## 2026-07-31 — hobo-code optimizexp surfaces MERGED

- PR: https://github.com/Tyler-R-Kendrick/HoBo/pull/990
- Merge: `5e88a064`
- CI: billing-red empty-step failures; package tests green locally

## 2026-07-31 — hobo-code-tui-optimizexp-finish (#992)

- **PR:** https://github.com/Tyler-R-Kendrick/HoBo/pull/992
- **merge:** `fb761534054510d2e6366b4f58a11b4cad5648fb` (squash)
- **scope:** TUI craft product + optimizexp doctor/explore + personas + scaffolds
- **CI:** billing-budget empty-step failures only; local vitest 107 green
- **protocol:** `/sdlc finish`

## 2026-07-31 — hobo-code InteractiveShell (#994–#995)

- **#994** fix stale dist launcher — merge `704a5063`
- **#995** InteractiveShell replaces stock Pi default TTY — merge `8d9a7b89`
- **CI:** billing-budget empty-step failures documented; product tests green locally
- **protocol:** `/sdlc finish`
- **residual:** streaming engine, mouse/tasks, warning budget, nix panes, optimizexp interactive hard-gate

## 2026-07-31 — optimizexp hobo-code shell polish (#997)

- **PR:** https://github.com/Tyler-R-Kendrick/HoBo/pull/997
- **merge:** `b2fe524fdc1504847094d3decbb9959ef9ae25b9` (squash)
- **optimizexp run:** `20260731-code-shell-optimizexp` stopReason pareto-equilibrium
- **CI:** billing-budget empty-step; local vitest green
- **protocol:** `/sdlc finish`

## 2026-08-01 — optimizexp CLI-experience overhaul + boyscout sweep (#999)

- **PR:** https://github.com/Tyler-R-Kendrick/HoBo/pull/999
- **scope:** optimizexp falsifiable scoring + v2 personas + product-CLI features + drift gate; 10 CLI UX defects; ULID/fence/conformance/runtime-wasm real bugs; turbo dep cycle; architecture-guard debt on main; swe-shared buf codegen; example API drift
- **review:** independent reviewer approve-with-comments, no blockers
- **CI:** billing-budget empty-step failures (conformance, rehearsal, agent-e2e, S0 ×2, offline-hello-bindle, adversarial, replay-equals-live) — same red set as #965/#997/#968; PR impact gate ran real steps; cold-runner timeouts fixed (de6d4c0a, 00a860f2); DCO satisfied via squash-commit sign-off
- **local:** check:all exit 0 (test:unit 4585, behavior 98), turbo 769/769, contracts 604+200
- **protocol:** `/sdlc finish`
- **residual:** storage-sqlite provider-verification lane (tracked in packages/storage-sqlite/contracts/provider/README.md); globalSetup wasmtime warmup scope; backlog-malformed warn; user asked to disable CI workflows to save runner minutes

## 2026-08-01 — sdlc finish (identity OpenBao + integrity membrane)
- PR: https://github.com/Tyler-R-Kendrick/HoBo/pull/1003
- Merge: `769b68a6` (squash)
- Branch: `feat/identity-openbao-secrets`
- Outcome: merged; CodeRabbit rate-limit only (not code CI red)

## 2026-08-01 — OptimizeXP bare UX/DX/AX resume (#1005)

- **PR:** https://github.com/Tyler-R-Kendrick/HoBo/pull/1005
- **branch:** `feat/optimizexp-bare-resume`
- **run:** `20260801-ux-dx-ax-bare-resume`; Pareto equilibrium; harm `5/3 → 1/1`
- **local:** staged and PR-base `agent:check` passed 12 relevant gates
- **status:** closeout in progress

## 2026-08-01 — OptimizeXP bare UX/DX/AX resume merged (#1005)

- **merge:** `9d728e752cec0239c69aa195f70ddaa2ec6da1ed` (squash)
- **result:** success; independent review blocker fixed by committing and hash-verifying `primary.cast`
- **checks:** 12 local PR-base gates green; GitHub clean/mergeable; no review threads
- **failure class:** `billing-budget` for CodeRabbit line-review quota only; its status context passed

## 2026-08-03 — Try HoBo browser WIT examples (#1008)

- **PR:** https://github.com/Tyler-R-Kendrick/HoBo/pull/1008
- **merge:** `af7fa3911b522f6d313b849acae8d1468111f800` (squash)
- **result:** success; independent review findings fixed and focused re-review clean
- **checks:** 18 impact-selected staged and PR-base gates; typed WIT component,
  protobuf/CUE/generated drift gate, 139-page build, and served Playwright journey
- **failure class:** CodeRabbit free-plan review quota only; no implementation check failed
- **protocol:** `/sdlc --finish`

## 2026-08-03 — TrafficRouting production offerings + adapters (#1011)

- **PR:** https://github.com/Tyler-R-Kendrick/HoBo/pull/1011
- **branch:** `feat/traffic-routing-vercel-lakebed-prod`
- **merge:** `8f951254ba71c2253c68f8a3f915e7ea53d99301` (squash)
- **result:** success
- **scope:** production Vercel/Lakebed adapters (no stubs); offerings + prefer/require fallback ladder; Cloudflare create lifecycle + observeHealth; Funnel multi-backend; Station applyRoutingObservations; provider trafficRouting profiles (lakebed/cf/aws/gcp/azure)
- **checks:** local `agent:check --base=origin/main` 10/10 green (core/connectivity/stations + provider packages); CodeRabbit SUCCESS (rate-limited review only); no PR comment threads
- **failure class:** none for code CI; CodeRabbit free-plan rate limit only
- **protocol:** `/sdlc --finish`

## 2026-08-03 — Vision-gap closure: dispatcher→signals→loop→saga→staging→offerings→data dual

- **branch:** `feat/vision-gap-closure`
- **scope:** all seven phases of the vision-gap roadmap now implemented:
  1-2 `@hobo/dispatcher` promotion + broker `budget.ThresholdCrossed`/`Recovered`
  signal plane; 3-4 stations closed control loop + progressive cutover with the
  `domain-cutover-saga-contract` proof promoted (fail-closed preconditions,
  rollback hysteresis, refusal/TtlLowered ladder; frozen in the promotions
  ledger); 5 `pnpm run staging:cutover` (simple rehearsal green with archived
  evidence under `docs/design/instances/staging-cutover/`; vercel/cloudflare
  lanes credential-gated exit 2); 6 generic per-resource-class offering
  resolution + data-store vocabulary + station offering registry; 7 trails live
  SQLite data-dual port (CDC dual-write journal, watermark replication,
  pooled→siloed tenant scoping, divergence auto-compensate)
- **behavior:** `transparent-backend-swap.feature` — "user notices nothing when
  the backend swaps under budget pressure" (live-proxy zero-failed-requests);
  behavior lane 100 scenarios green
- **tests:** dispatcher 19, broker 70, core 78, stations 45, trails 17 green;
  architecture guard + staged agent:check green per commit
- **protocol:** goal-hook continuation of the incomplete prior session

## 2026-08-04 — Upgrade & Migration Engine M1-M4 ladder

- **branch:** `feat/upgrade-migration-m1-m4`
- **scope:** the design-gated ladder delivered end to end:
  **M1** `upgrade-preflight.ts` (HOBO-499 promotion; compatibility-input matrix,
  dry-run contract + fixtures, rollback evidence, scope-boundary register);
  **M2** live expand→backfill→contract executor (`schema-apply-port.ts`,
  `migration-executor.ts`) — snapshot-before-mutation, compat-gated contract,
  snapshot-restore rollback, full `migration.*` event family;
  **M3** pooled→siloed zero-loss tenant move (`tenant-move-port.ts` + dual-port
  fence/backfill/reap) through the identity spectrum-cutover protocol —
  conformance `source quiescent seq == silo head`;
  **M4** golden-replay corpus + upcaster-totality can-deploy gate promoted to
  `@hobo/events` with the `migration.*` v1 corpus pinned append-only
- **docs:** M1-M4 evidence sections in `upgrade-migration-engine.md`; full
  `migration.*` family catalogued in `event-families.md`; known-limitations
  HOBO-430 row moved deferred → partial with explicit provider-binding caveats
- **proofs frozen:** `upgrade-rollback-dry-run-contract`,
  `event-body-upcaster-gate` (promotions ledger now 9 frozen)
- **tests:** trails 31, events 11, identity 88, behavior lane 100 scenarios —
  all green; architecture guard + staged agent:check green per commit

## 2026-08-04 — Standards alignment (ADR-0144) + thin Convex provider (#1024)

- **PR:** https://github.com/Tyler-R-Kendrick/HoBo/pull/1024 — merge `86119ffcb`
- **scope:** critique-driven delivery of the standards-alignment instruction
  (fact-check + corrections in `docs/plans/0016`): ADR-0144 external-spec
  posture + Resource Definition versioning; platform-engineering versioning
  section; convex.md impedance boundaries; new wasp.md capture;
  `@hobo/provider-convex` (honest equivalence classes, deploy-key-brokered
  manifest, convex-deploy driver programs, typed impedance, fail-closed
  cred-gated Management API); AGENTS.md bindle-first guidance;
  live-provider-matrix row
- **tests:** provider-convex 23/23; architecture guard + staged agent:check
  green per commit (ADR index + traceability gates included)
- **protocol:** goal-hook one-shot with two Explore fact-check sweeps

## 2026-08-04 — Lineage credits + Trait/Boundary + jurisdiction/compliance core (#1028)

- **PR:** https://github.com/Tyler-R-Kendrick/HoBo/pull/1028 — merge `1658bbf07`
- **scope:** three-workstream brainstorm formalization: canonical
  `docs/design/lineage.md` credits surface + nine new influence captures
  (tailscale, cedar, temporal, argo-cd, flux-cd, service-mesh pattern, cnab,
  oam, octopus-deploy); ADR-0145 first-class Trait + architecture component/
  boundary taxonomy + glossary rows; ADR-0146 typed legal geography
  (`@hobo/core` jurisdiction port, fail-closed `evaluateResidency`,
  `Tenant.residency`, Gatekeeper `residency` gate) + `@hobo/policy` residency
  pack (`eu-data-stays-in-eu` realized) + control→evidence packs with NIST
  800-53 seed + `docs/standards/oscal.md`
- **tests:** core 85 / policy 23 / contracts 36; codegen CLEAN; guard green;
  staged agent:check green per commit
- **protocol:** plan-mode brainstorm (3 Explore sweeps) → approved plan →
  single-branch delivery
