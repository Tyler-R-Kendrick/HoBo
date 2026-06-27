# HOBO-363 Dispatcher Maximize-Credits Proof

This proof backs [PLAN-04](../../control-plane.md#plan-04),
[PLAN-05](../../reliability-observability-cost.md#plan-05),
[PLAN-25](../../platform-engineering.md#plan-25), and
[ADR-0071](../../adr/01-architecture-core.md#adr-0071).

The executable POC in
[`src/draft/dispatcher-maximize-credits-contract`](../../../../src/draft/dispatcher-maximize-credits-contract)
pins the M2 Dispatcher contract for `maximize-credits` placement and dispatch decisions.

## Acceptance Evidence

- A fixture `CreditLedgerView` ranks a CI job to the cheapest registered runner with free headroom
  and records `dispatch.Decided` with the pinned ledger seq and balance hash.
- Replaying the serialized dispatch input yields the same winner, ranking, and event body.
- Exhausting a free tier rotates the next dispatch pick to the declared min-cost runner.
- Resource placement emits `match.Decided` with objective `maximize-credits`.
- Missing credit facts degrade to plain declared min-cost ranking.
- Budget caps and spend-to-date keep an otherwise cheaper over-cap runner behind an affordable
  runner.

## Adversarial Evidence

- A rate-limited free tier is not treated as depletable free headroom.
- Switching cost can beat free-tier chasing when egress/amortized move cost is larger than the
  savings.
- Equal zero-cost candidates prefer the soonest-expiring credit.
- Misdeclared free-tier facts degrade to min-cost instead of throwing or winning.
- No registered candidates fail closed without emitting `dispatch.Decided`.

## Scope Boundary

The proof consumes local fixture `CreditLedgerView` snapshots and provider registrations. It does
not implement adapter calls, live cost-event production, reservation/double-spend CAS, traffic
routing, or rebalance/hysteresis loops.

## Verification

```powershell
npm.cmd --prefix src\draft\dispatcher-maximize-credits-contract test
npm.cmd test
node scripts\validate-traceability.mjs
```
