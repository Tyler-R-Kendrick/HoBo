---
type: Implementation Plan
title: "Ship remediation plan — work packages for agent execution"
description: "Ordered, non-overlapping work packages that remediate 0011 ship-readiness findings. Distinguishes agent-executable work from human/account blockers. Designed for parallel subagent dispatch."
tags: [hobo, plans, ship, remediation]
---

# Ship remediation plan

> **Parent findings:** [`0011-ship-readiness-gap-review.md`](./0011-ship-readiness-gap-review.md)  
> **Head at plan authoring:** use `git rev-parse --short HEAD` at execution time for drift checks.  
> **Ship order (default):** Target **A** (OSS public hygiene) then **B** (local-first npm prep). Target **C** is documented as residual human/product work, not faked complete.

## Principles

1. **Honesty over theater.** Prefer accurate limitations over greenwashed gate tables.  
2. **Non-overlapping file ownership** so parallel subagents never edit the same path.  
3. **Human blockers stay human.** Agents implement max docs/config/code; ledger residual items explicitly.  
4. **Do not claim CI green** until a run has a real runner and logs.  
5. **Do not draft customer legal text** as if counsel-approved; only process instances + placeholders.  
6. Match repo conventions: OKF frontmatter on design docs; Conventional Commits; relative `.md` links; update `docs/plans/index.md` and design index rows when adding design records.

## Dependency graph

```text
WP-A (launch definition + instances)
  └─► WP-B (truth-in-advertising)     [can parallel after ADR id known]
  └─► WP-C (CI workflow fixes)        [parallel]
  └─► WP-D (publish hygiene)          [parallel]
  └─► WP-E (componentize honesty + residual ledger) [parallel]
WP-F (integration / docs index / final consistency)  [after A–E]
```

Human-only (not claimed fixed by agents):

```text
H-V1  Restore GitHub Actions runner assignment (billing / spending limit)
H-O2  Counsel: ToS, privacy, DPA, subprocessor list
H-O3  Staffed support for hosted beta
H-O4  Dogfood Yard on real cloud + beta pilot
H-E1b First real npm publish (needs NPM_TOKEN + green CI)
H-E3b Real jco/componentize-js pipeline (multi-day)
H-E5  Live AWS/GCP/Azure apply paths
H-E6  Production OIDC/SPIRE
H-T1  Full proof-hardening waves W3–W6
```

---

## WP-A — Launch definition + readiness instances

**Finds:** L0, O1, O8 (partial), cutline for A/B  
**Owner agent:** launch-ops  
**Files in scope (only):**

- `docs/design/adr/07-portability-extensibility.md` — add **ADR-0140** Launch ship targets A/B/C  
- `docs/design/adr/index.md` — index row for ADR-0140  
- `docs/design/launch-ship-targets.md` — short human-facing summary linking ADR  
- `docs/design/instances/README.md` — directory purpose  
- `docs/design/instances/v1-readiness-dashboard-2026-07-30.md` — first populated dashboard (honest red/yellow)  
- `docs/design/instances/go-no-go-repo-public-2026-07-30.md` — practice conditional-go for Target A  
- `docs/design/instances/go-no-go-developer-tooling-2026-07-30.md` — no-go or conditional for B until publish  
- `docs/design/instances/accepted-risks-2026-07-30.md` — single-maintainer, CI outage, synthetic wasm, in-memory default  
- `docs/design/go-no-go-decision-record.md` — extend Gate enum with `repo-public` and `developer-tooling` (document-only; do not break existing beta/RC/GA)  
- `docs/design/index.md` — discoverability rows if required by suite conventions  

**Out of scope:** source code, workflows, package.json, site marketing overhaul.

**Done criteria:**

- ADR-0140 states default order A → B → C and interim cutlines in S-stage terms  
- Dashboard instance exists with every field filled (red is OK)  
- At least one go/no-go instance for repo-public  
- Accepted-risks instance names owners as “single maintainer (Tyler Kendrick)” with revisit date  
- `pnpm run docs:okf` / design-lint happy for new frontmatter (or match sibling docs)

**Verification:**

```bash
rg -n "ADR-0140|repo-public|developer-tooling" docs/design
test -f docs/design/instances/v1-readiness-dashboard-2026-07-30.md
```

---

## WP-B — Truth-in-advertising

**Finds:** E9, E10 (docs), E2/E3/E4 labeling, O5 messaging  
**Depends on:** ADR-0140 id (link it)  
**Owner agent:** docs-honesty  
**Files in scope:**

- `README.md` — package count, verb count (38), status summary; ship targets pointer to ADR-0140 / 0011  
- `packages/hobo/README.md` — composition root is the product binary; HONEST SCOPE summary  
- `packages/hobo/ARCHITECTURE.md` if present and stale vs compose  
- `packages/cli/README.md` — shell vs composed binary; dual-bin note  
- `packages/componentize/README.md` — synthetic wasm contract bytes honesty  
- `site/src/pages/guide/status.md` — align verb count; link ship targets; keep pre-release honesty  
- `docs/design/known-limitations-register.md` — rows for: in-memory default IaC, synthetic componentize, fixture login, CI runner outage (if customer-facing), npm not published  

**Out of scope:** workflow YAML, package private flags, ADR body (only links).

**Done criteria:**

- No “27 packages / 27 verbs” claims  
- Synthetic componentize and in-memory default stated where install/deploy is described  
- `@hobo/hobo` identified as composed product CLI; `@hobo/cli` as shell/factories  

**Verification:**

```bash
rg -n "27 production|27 verbs|27 \`hobo\`" README.md && exit 1 || true
rg -n "38|synthetic|in-memory|@hobo/hobo" README.md packages/hobo/README.md packages/componentize/README.md site/src/pages/guide/status.md
```

---

## WP-C — CI integrity (agent-fixable)

**Finds:** V3, V4, V2 (doc evidence style)  
**Owner agent:** ci-gates  
**Files in scope:**

- `.github/workflows/stage-gate-s0.yml` — digest-parity artifact paths must not hardcode `ubuntu-latest` when matrix uses `vars.HOBO_RUNNER_LINUX_SMALL`  
- `.github/workflows/hobo-ci.yml` — add `push: branches: [main]` for main-gate path **or** document merge-queue-only in workflow comments AND `docs/design/instances/` note; prefer actual `push` trigger for main-gate  
- `docs/design/build-s0-stage-gate-acceptance.md` — S1-style local evidence + “pending runner restoration” for CI columns (not silent TODO forever)  
- `docs/design/build-s1-stage-gate-acceptance.md` — only if touch-ups needed for consistency  

**Out of scope:** account billing (H-V1); inventing green CI URLs.

**Done criteria:**

- Digest job resolves Linux artifact name from the same expression as the matrix leg (e.g. env var / matrix label output)  
- main-gate can run on push to main **or** explicit enforced merge-queue policy documented in workflow header  
- S0 table no longer bare `TODO` without explanation  

**Verification:**

```bash
rg -n "ubuntu-latest/stage-gate|ubuntu_record" .github/workflows/stage-gate-s0.yml
# Prefer zero hardcodes of ubuntu-latest in digest download paths
rg -n "push:" .github/workflows/hobo-ci.yml
rg -n "pending runner|Local evidence|TODO" docs/design/build-s0-stage-gate-acceptance.md
```

---

## WP-D — Publish hygiene (prep Target B, no live publish)

**Finds:** E1 (prep), E11, E10 (manifest), PUB risks  
**Owner agent:** publish-hygiene  
**Files in scope:**

- Selected `packages/**/package.json` — set `"private": true` on immature / thin / internal packages (see allowlist below)  
- `docs/design/npm-publish-allowlist.md` — first-publish allowlist + prerelease policy  
- `.github/workflows/publish.yml` — **workflow_dispatch-only** skeleton that documents required secrets, does not run on PR, `needs` comment for artifact-trust  
- `packages/cli/package.json` — remove or rename conflicting public `bin.hobo` if `@hobo/hobo` is the product bin (prefer: keep `bin` only on `@hobo/hobo`; `@hobo/cli` may keep programmatic exports without `bin`, or `bin` under a different name). **Do not break workspace tests** — fix imports/scripts if needed.  
- `docs/plans/0012-ship-remediation-plan.md` status notes only if required  

**First-publish allowlist (remain publishable / not forced private):**

`@hobo/core`, `@hobo/bindles`, `@hobo/contracts`, `@hobo/contract-harness`, `@hobo/runtime`, `@hobo/runtime-local`, `@hobo/storage-sqlite`, `@hobo/wit`, `@hobo/cli` (library; bin optional), `@hobo/hobo`, `@hobo/mcp`, `@hobo/conformance`, `@hobo/identity`, `@hobo/policy`, `@hobo/connectivity`, `@hobo/events`, `@hobo/data`, `@hobo/stations`, `@hobo/trails`, `@hobo/replay`, `@hobo/adapter-hono`

**Force private (examples — apply judgment if a package is thick enough to keep public):**

`@hobo/camps`, `@hobo/yards`, `@hobo/junctions`, `@hobo/stage-gate`, `@hobo/componentize` (synthetic), `@hobo/runtime-cloud-native` (stubs), `@hobo/schema-tools`, `@hobo/ci-guard`, `@hobo/broker`, `@hobo/cloud`, `@hobo/training-pipeline`, all `providers/*`, all `connectors/*` already private, `@hobo/iac-*` until live-default policy decided (prefer private for now)

**Out of scope:** actual `npm publish`, NPM_TOKEN, version bumps beyond docs.

**Done criteria:**

- Immature packages cannot be published via `publishConfig` alone without removing `private`  
- Allowlist doc exists  
- Publish workflow is manual-only and fails closed without secrets  
- Dual public `bin.hobo` conflict resolved or documented with one product bin  

**Verification:**

```bash
rg -l '"private"\s*:\s*true' packages/camps packages/yards packages/junctions packages/componentize packages/stage-gate packages/runtimes/runtime-cloud-native
test -f docs/design/npm-publish-allowlist.md
test -f .github/workflows/publish.yml
```

---

## WP-E — Componentize honesty + residual human ledger

**Finds:** E3 (honesty), residual H-*, T1 note  
**Owner agent:** residual  
**Files in scope:**

- `packages/componentize/src/**` — only if adding a clear runtime comment / `HONEST_SCOPE` constant or README already covered by WP-B; prefer **docs + source file header comment**, not a full jco rewrite  
- `docs/design/instances/residual-human-blockers-2026-07-30.md` — H-V1, H-O2, H-O3, H-O4, H-E1b, H-E3b, H-E5, H-E6, H-T1 with owners and “agent cannot close”  
- `docs/design/build-s0-stage-gate-acceptance.md` — only if WP-C did not already note synthetic componentize impact on sign/digest gates  
- `SECURITY.md` — confirm contact path works for public repo (no secret values)  
- `scripts/` only if adding a documented `ship:preflight` script that lists residual checks (optional)

**Done criteria:**

- Residual ledger lists every H-* item with unblock condition  
- Componentize code or package docs state contract-bytes path explicitly  
- No claim that H-V1 is fixed  

**Verification:**

```bash
test -f docs/design/instances/residual-human-blockers-2026-07-30.md
rg -n "synthetic|contract.?byte|buildWasmContractBytes|HONEST" packages/componentize
```

---

## WP-F — Integration (coordinator after A–E)

**Owner:** main agent / integrator  

1. Merge any worktree branches if used.  
2. Update `docs/plans/index.md` for 0011 + 0012.  
3. Cross-link README → 0011/0012/ADR-0140.  
4. Run narrow checks:

```bash
pnpm run docs:okf
pnpm run docs:design-lint
pnpm run docs:freshness   # if required by change set
# if package.json private flags changed:
pnpm run licenses:check || true
```

5. Mark each WP status in this file’s status table.  
6. Do **not** open public repo or publish npm without human confirmation.

---

## Status table

| WP | Status | Notes |
|---|---|---|
| WP-A Launch definition + instances | **done** | ADR-0140, launch-ship-targets, instances/* go-no-go + dashboard + risks |
| WP-B Truth-in-advertising | **done** | README, status, known-limitations, package READMEs, ARCHITECTURE |
| WP-C CI integrity | **done** | stage-gate-s0 linux/windows artifacts; hobo-ci push main; S0 table honesty |
| WP-D Publish hygiene | **done** | private flags, npm-publish-allowlist, publish.yml dry-run, cli bin removed |
| WP-E Residual ledger + componentize honesty | **done** | residual-human-blockers instance; componentize source HONEST SCOPE |
| WP-F Integration | **done** | plans index, instances README residual row, compose comment fix |
| H-V1 Actions runners | **human** | Account billing — still open |
| H-O2 Legal counsel | **human** | still open |
| H-O3 Staffed support | **human** | still open |
| H-O4 Dogfood / pilot | **human** + product | still open |
| H-E1b npm publish | **human** after CI green | dry-run workflow only |
| H-E3b Real jco | **deferred** L | Honesty landed in WP-B/E |
| H-E5 Live multi-cloud apply | **deferred** | |
| H-E6 Production OIDC | **deferred** | |
| H-T1 Proof waves | **deferred** | |

---

## Subagent prompt skeleton

```text
You implement WP-X from docs/plans/0012-ship-remediation-plan.md in repo
/home/codex/.herdr/worktrees/hobo/worktree-brave-river-7200.

Rules:
- Edit ONLY files listed in WP-X "Files in scope"
- Do not claim CI green or publish to npm
- Never invent secret values
- Match OKF frontmatter / existing doc style
- When done: list files changed, verification commands run, residual risks

Findings context: docs/plans/0011-ship-readiness-gap-review.md
```

## Exit criteria for “remediation complete” (agent scope)

- [x] ADR-0140 + instances directory exist  
- [x] Truth-in-advertising pass on README + status + componentize + hobo/cli READMEs  
- [x] stage-gate-s0 digest path fix + hobo-ci main push (or documented MQ-only)  
- [x] S0 acceptance table no longer unexplained TODO  
- [x] Publish allowlist + private flags + manual publish workflow  
- [x] Dual-bin conflict resolved or single product bin  
- [x] Residual human blockers ledger committed  
- [x] docs/plans index updated  
- [x] Explicit list of H-* items remaining for humans  

**Completed (agent scope):** 2026-07-30 via parallel WP-A…E subagents + WP-F integration.  
**Not completed (human):** H-V1, H-O2, H-O3, H-O4, H-E1b, H-E3b, H-E5, H-E6, H-T1 — see [`docs/design/instances/residual-human-blockers-2026-07-30.md`](../design/instances/residual-human-blockers-2026-07-30.md).
