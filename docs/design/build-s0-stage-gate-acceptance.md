---
type: Reference
title: "Build S0 Stage Gate Acceptance"
description: "Source issue: HOBO-589."
tags: [hobo, design, s0, stage-gate]
---

# Build S0 Stage Gate Acceptance

Source issue: [HOBO-589](https://linear.app/quickdeploy-ai/issue/HOBO-589/s0-12-stage-gate-s0-signed-hello-bindle-component-through-ci-all).

Executable proof for this acceptance record is **not** a `src/draft/` package. The runnable
signals are:

- `.github/workflows/stage-gate-s0.yml` (green on `main` means S0 is done)
- `packages/stage-gate/` unit and consumer-contract tests (`pnpm --filter @hobo/stage-gate test`)

CI builds `@hobo/stage-gate` then invokes `node packages/stage-gate/dist/cli.js run s0` (workspace
bins are not linked at the repo root until the package is a declared dependency). Failed runs still
upload `stage-gate-s0.record.json` as a workflow artifact (`if: always()`).

## Scope In

- `@hobo/stage-gate` runner that executes and records the S0 toolchain check list fail-closed.
- `StageGateRecord` protobuf + CUE contract in `packages/stage-gate/data-models/`.
- Stage-gate CI workflow with Ubuntu/Windows matrix digest equality assertion.
- This acceptance record, design index row, and traceability row.

## Scope Out

- Implementing the underlying gates (boundary lint, architecture guard, schema drift, PACT harness,
  conformance harness, hello-bindle fixture, signing pipeline) — owned by S0-01..S0-11.
- `camp`-tag cloud E2E, registry lifecycle, Sigstore transparency-log lookup, key rotation.

## Gate Table

| Gate | Command | CI run (Ubuntu) | CI run (Windows) | Evidence |
| --- | --- | --- | --- | --- |
| boundary-lint | `pnpm run lint:boundaries` | TODO | TODO | — |
| architecture-guard | `pnpm run architecture:guard` | TODO | TODO | — |
| schema-drift | `pnpm run test:schema` | TODO | TODO | — |
| contract-consumer | `pnpm run test:contract:consumer` | TODO | TODO | — |
| contract-provider | `pnpm run test:contract:provider` | TODO | TODO | — |
| conformance-self-test | `pnpm --filter @hobo/conformance test` | TODO | TODO | — |
| hello-bindle-determinism | `node --import tsx packages/stage-gate/scripts/check-hello-bindle-determinism.mts` | TODO | TODO | component digest (pending CI) |
| hello-bindle-health | `node --import tsx packages/stage-gate/scripts/check-hello-bindle-health.mts` | TODO | TODO | `hello-bindle:ok` |
| sign-provenance-verify | `node --import tsx packages/stage-gate/scripts/check-sign-verify.mts` | TODO | TODO | signer identity, provenance tier, conformance report digest |
| tampered-artifact-refused | `node --import tsx packages/stage-gate/scripts/check-tamper-refuse.mts` | TODO | TODO | refusal reasons include `artifact.digest_mismatch` |

> CI run URLs and digest/signer/provenance values are filled after the first green
> `stage-gate-s0` workflow on the PR branch. Earlier rows remain append-only evidence.

## Proof Expectations

- Parser rejects malformed or internally inconsistent records (`parseStageGateRecord`).
- Runner fails closed on any non-zero check exit code.
- Tampered artifact verification is recorded as refused in the negative check.
- Cross-OS matrix legs report identical `sha256:` component digests when S0-11 production fixture is available.

## Maintenance

Promotion note: stage-gate check scripts currently fall back to the draft hello-bindle fixture at
`src/draft/technical-proofs/hobo-componentize-contract/examples/hello-bindle` until
`examples/hello-bindle` lands from S0-11. No draft code is imported at runtime from production
package sources beyond these orchestration scripts.
