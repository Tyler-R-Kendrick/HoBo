---
type: Delivery State
title: "HoBo CI delivery state"
description: "Durable delivery history and coordination state for the HoBo CI implementation."
tags: [ci, delivery, state]
---

# HoBo.CI delivery state

- Current phase: lowest-cost routing implementation and managed Vercel hosting planning
- Current branch: `feat/ci-cheapest-routing`.
- Prior production PR: [#1596](https://github.com/Tyler-R-Kendrick/HoBo/pull/1596),
  squash `4e2e7ca2c0360224e3beb1a982834e80495bb3d8`.
- Prior SDK delivery: [#1594](https://github.com/Tyler-R-Kendrick/HoBo/pull/1594),
  squash `a262136d98e6699f8093c45fb36e32ea0a931864`; its closure record was #1595.
- Current user acceptance: deployable service and a testable `runs-on: hobo` branch,
  not an experimental/scaffold-only release.
- Parent owns shared contracts, composition, docs, gates and PR delivery.
- Isolated implementation/review covered onboarding, runtime lifecycle,
  deployment, connected acceptance, host shutdown and workflow policy.

## Selected hosting follow-up

The user selected Vercel hosting that exposes a public relay. Functions/Services
will receive GitHub webhooks, policy/onboarding requests and OIDC/JIT claims;
transactional external state and queue-driven workers will own durable admission
and reconciliation. An outbound Daemon is optional for continuous polling, not
the public HTTP listener. Existing SQLite/container assets remain self-hosted
adapters and regression references, not a prerequisite VM deployment.

The [hosting and policy plan](hosting-and-policy-plan.md) records the source
audit, official platform constraints, adversarial/YAGNI/rubber-duck passes,
SDK desired-state and Station Connection design, and contract-based delivery
slices. Implementation and resource provisioning have not started in this
follow-up. The user requested lowest total cost and temporary execution; routing
compares projected charges after applicable free allocation. The Vercel adapter
and temporary preview deployment remain planned work. No hosting accounts, secret
inventories or other repositories were probed, and no provider resource was
created. Separate architecture and
adversarial reviews identified and closed the legacy-write, Connection-resolution,
identity-linking, shared-parent-budget and repair-schedule gaps. Scoped CLI/design
documentation checks and relative-link checks passed. The current branch also
updates runtime ranking and its regression tests for lowest projected cost.

## Production repairs

Persistent account policy/operation state, tenant-scoped authenticated API,
repository setup PRs and verified protected pins, token-bound installation authority,
secret-file deployment, process owner fencing, bounded drain, process-group cleanup,
private-repository bridge fencing, async revocation fencing, paginated discovery, inclusive
usage snapshots, monotonic ready operations and readonly-backup restore are implemented.
The Station bridge consumes actual Broker budget facts and persists threshold
ordering with account policy. Independent review found dispatch/JIT authority
revocation races; both are fixed with deferred-request regression tests.
Validation passed: 588 tests across CI/Actions/Dagger/Cloudflare/Stations,
16 relevant staged gates, generated protobuf/CUE checks, seven connected act
executions with three rejecting fault runs, and seven actual container checks.
Final image: `sha256:bc5b475c243ccb2ec172575dde3669cf4b178559b2e77a1e0833775e20d2a7cd`.
Thirteen compiled runtime modules match fresh compilation of the source.
PR-base validation passed all 16 relevant checks. The first exact-six design
review identified two documentation contradictions: obsolete spend-baseline
instructions and a live-test recipe that replaced the reviewed manual workflow
with the local act fixture. Both instructions were corrected; the refreshed
cycle1 review unanimously approved head `976919abe63fe1244792f1fdbe9c65bc40df2eea`
before #1596 was squash-merged.

The two independent P2 findings are resolved: dispatch re-resolves authority after
GitHub reads; JIT rechecks original branch/event authority after host checks.
The independent reviewer reran 27 lifecycle/revocation regressions successfully.
Runtime/backups execute without root; persisted threshold flags reject rollback
with HTTP409 and survive actual service restart.

## Evidence and boundary

Actual local act execution, full connected protocol tests and the nonroot image
lifecycle are independently observable. An actual GitHub queue/vendor run remains
unverified: runner-management API permission was HTTP403, and automatic approval
review rejected an additional optional live probe under the prior contract-only
scope. No extra repository/App/provider resource was created to bypass this.

The active acceptance workflow is manual-only and has literal `runs-on: hobo`;
all preserved hosted CI remains disabled. Do not label a local/permission/identity
check as successful remote runner execution. See README for exact test commands.

## Prior review history

The original SDK head `56fdbe73b6f09dc3a39b94bb5f8310cc17e4fb9b` passed
238 package tests,22 protocol regressions,19 PR-base checks and40 actual act jobs.
Its exact-six SDK/DX review was unanimous yay (cycle2,
`sdk-closeout-cycle-2-consensus`; proposal
`2251301bd67552f2e0337c69a4de34ef99e051a7520ac30ec247a1601188ee7e`).
That approval applies to that historical head, not the production continuation.
