# Budget/Quota Policy Contract POC

Independent POC for HOBO-290. It pins the M2 cost-safety gate between
`MeteringView` and the policy plane without implementing the policy engine,
showback UI, spend-velocity circuit breaker, or cost-driven degradation tiers.

## Contract Surface

- `evaluateBudgetQuotaPolicy({ request, meteringView, policies, approval })`
  consumes a policy `DecisionRequest` and a seq-pinned `MeteringView` snapshot.
- Camp and tenant budgets support soft and hard USD thresholds.
- Agent `spendCapUsd` is treated as the same quota gate, with explicit approve
  or deny handling.
- Decisions return a policy IR decision plus an auditable `policy.Decided`
  event and supporting `spend.*` budget/cap facts.

## Scope Boundaries

Included:

- Soft budget crossing yields an allow decision with a warning obligation.
- Hard budget crossing denies spend-incurring deployment and agent-provision
  gates.
- Agent spend-cap crossing requires approval, honors approved/denied outcomes,
  and records approver evidence.
- Estimate-vs-actual overspend is marked as reconciliation-required without
  implementing the reconciliation engine.
- Out-of-order `MeteringView` updates fail closed.
- Partial-provision hard denies carry a compensation obligation.

Excluded:

- Policy-engine implementation or rule authoring.
- Spend-velocity circuit breaker and `spend.CircuitTripped`.
- Cost-driven graceful degradation and `allow-degraded`.
- Showback presentation or billing/chargeback.

## Verification

```powershell
npm.cmd --prefix src\draft\budget-quota-policy-contract test
npm.cmd test
```
