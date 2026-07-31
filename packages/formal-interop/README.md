# `@hobo/formal-interop`

Private package implementing formal-interop hypotheses **H1–H7** (plan
[`docs/plans/0015-formal-interop-hypotheses.md`](../../docs/plans/0015-formal-interop-hypotheses.md)).

## Surfaces

| Module | Wave | Role |
|---|---|---|
| `openui-ir`, `beq`, `fixtures`, `promotion` | W0 / H4 | OpenUI tree IR + structural/semantic BEq + fail-closed promotion |
| `libraries`, `ablation`, `mismatch`, `certificate` | W1 / H2·H7·H3 | Controlled vs ecosystem tiers, mismatch injection, certificate replay |
| `formal/controlled-core` + `formal-package`, `multi-itp` | W2 / H1·H5 | Axiomatized Lean package + multi-ITP harness (offline or live lake) |
| `training` | W3 / H6 | Specialized formal-interop train/eval **behind training-engine port only** |
| `metrics` | all | JSONL ledger → `docs/plans/formal-interop-runs/ledger.jsonl` |

## Invariants

- Fail closed: missing trees/cert/formal package or untyped claims never promote.
- No public SDK export of the trainer (`publicSdkExport: false`).
- Controlled Lean path has **no Mathlib** imports; Mathlib contrast is fixture-only.
- Pure zero-shot is a measurement baseline, not the production promotion path.

## Related design law

- [ADR-0141](../../docs/design/adr/03-data-plane-constrained-legality.md) — executor residual control + Γ first; weighted multi-hole circuit later; model-facing topology heads frozen until anti-E237.
- [Plan 0016](../../docs/plans/0016-constrained-diffusion-e1-parity.md) — E1–E9 experiment ladder + anti-E237.

## Experiments (plan 0016)

```bash
pnpm --filter @hobo/formal-interop test
```

Shipped runners: `runE1Parity`, `runE2Cold`, `runE3LoadCheck`, `runE4StaticMacros`, `runE8ZeroForward`, `runE9ClaimHygiene`, `runExperimentSuite`, `evaluateClaimClassGate`, `validateAntiE237Card`. Ledger: `docs/plans/formal-interop-runs/experiments-e1-e9.jsonl`.

## Test

```bash
pnpm --filter @hobo/formal-interop test
```
