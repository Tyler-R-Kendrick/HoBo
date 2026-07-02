# S6-06 FinOps plane draft POC (HOBO-661)

Independent project MVP for the S6 FinOps plane: plan-time cost estimates from
provider `cost.json`, budget/spend-cap deploy gates, and showback aggregation from
the event log.

Promotes:

- `src/draft/epic-proofs/finops-budget-routing-control-plane/` (DecisionGraph /
  ActionPlan routing contract vocabulary)
- `src/draft/epic-proofs/reliability-observability-cost-finops/` (FinOps budget
  guard + metering/showback fixtures)
- Technical proofs: `cost-signal-contract`, `budget-quota-policy-contract`,
  `metering-view-projection-contract`, `showback-attribution-contract`

## Scope

- `estimatePlanCost` — sums `cost.json` unit prices × plan usage profile +
  egress tiers; validates region coverage.
- `evaluateFinOpsDeployGate` — wraps budget/quota/agent spend-cap policy
  evaluation for deploy blocking or approval.
- `projectShowbackFromEvents` / `reconcileShowbackProjection` — folds
  `meter.UsageRecorded` events into MeteringView + showback rows.

## Out of scope

- Production `packages/cloud` FinOps implementation (owned by S6-06 production
  slice after S6-01 acceptance record merges).
- Live billing, provider APIs, dashboard UI, or DecisionGraph routing execution.

## Validation

```bash
pnpm --prefix src/draft/projects/s6-06-finops-plane test
```

## Acceptance mapping (HOBO-661)

| Criterion | Evidence |
|---|---|
| Plan estimate within ±20% of fixture (NFR-012) | `test/finops-plane.acceptance.test.ts` — `runs the end-to-end FinOps plane scenario` |
| Budget breach blocks deploy | same — `budgetBreachBlocksDeploy` |
| Showback reconciles against recorded spend | same — `showbackReconciled` |

## Architecture evidence

- `architecture/finops_plane.proto` + `finops_plane.cue`
- `contracts/pacts/finops_plane_boundary.pact.json`
- `features/finops-plane.feature`
- `ADR.md`
