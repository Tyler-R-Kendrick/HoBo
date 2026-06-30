# HOBO-6 CI Fabric Proof

This proof pins the M2 CI fabric contract from
[architecture.md](../../architecture.md), [walkthrough.md](../../walkthrough.md),
and [Plan 9](../../generated-stack.md#plan-09).

## Acceptance Mapping

| Acceptance | Executable proof |
|---|---|
| PR CI runs only checks relevant to the changed files and blocks on failure | `PR impact gate runs pnpm agent:check with the PR base instead of root-wide gates` |
| E2E authenticates to the sandbox cloud with no stored secret, deploys `hello-bindle`, asserts a live URL, tears down | `hello-bindle E2E uses keyless OIDC, asserts the live URL, and tears down` |
| E2E cost guard is label/schedule/manual gated and cleanup is asserted on failure | `cost guard keeps E2E behind a label, schedule, or manual dispatch` and `teardown and orphan sweep run even when the live URL assertion fails` |

## Adversarial Mapping

| Adversarial case | Guard |
|---|---|
| OIDC trust grants over-broad cloud access | `OIDC trust fails closed when the sandbox role is over-broad` |
| E2E leaks resources on failure | `missing teardown or orphan sweeper fails the E2E contract` |
| Flaky E2E blocks merges | `flaky E2E runs have a non-blocking quarantine lane` |

## Boundary

The executable proof lives in
[`src/draft/ci-fabric-oidc-e2e-contract`](../../../../src/draft/ci-fabric-oidc-e2e-contract/README.md).
The reviewable workflow skeleton is
[`.github/workflows/hobo-ci.yml`](../../../../.github/workflows/hobo-ci.yml). The PR gate
uses `pnpm agent:check -- --base=origin/<base-ref>` so CI follows the same
change-impact scope as the local hook instead of replaying repository-wide
build, typecheck, lint, test, docs, schema, and traceability lanes on every PR.
The standalone docs workflow is path-filtered to documentation/doc-linter inputs
and runs only changed-doc lint plus docs freshness.

This is a branch POC. It does not implement the runner/build-machine
cost-routed CI fabric, full multi-cloud E2E matrix, or real provider IAM
provisioning.

## Verification

```powershell
npm.cmd --prefix src\draft\ci-fabric-oidc-e2e-contract test
```
