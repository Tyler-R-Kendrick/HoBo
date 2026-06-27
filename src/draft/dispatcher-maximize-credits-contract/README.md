# Dispatcher Maximize-Credits Contract POC

Independent POC for HOBO-363. It pins the M2 Dispatcher ranking contract from
[ADR-0071](../../../docs/design/adr/01-architecture-core.md#adr-0071) for placement and CI/build
dispatch decisions that consume a pinned `CreditLedgerView@seq`.

## What This Proves

- `createDispatcherRegistry()` is the runner/build-machine registration seam; only registered
  candidates are eligible for `dispatch.Decided`.
- `decideDispatch()` ranks a CI job/build-machine request by effective marginal cost under
  `maximize-credits` and records `dispatch.Decided` with the pinned ledger seq and balance hash.
- `replayDispatchDecision()` reuses the serialized candidates and `CreditLedgerView` input to prove
  deterministic replay of the same pick and event body.
- `decidePlacement()` applies the same cost-aware ranker to resource placement and records
  `match.Decided` with objective `maximize-credits`.
- Absent or invalid credit facts degrade to declared min-cost ranking instead of throwing or chasing
  untrusted free-tier claims.
- Budget caps and spend-to-date headroom keep over-cap cheap candidates behind affordable
  candidates.
- Adversarial fixtures cover rate-limited free tiers, switching-cost/egress penalties, expiring
  credits, misdeclared free tiers, and the no-registered-candidates fail-closed path.

## Scope Boundary

This package is a deterministic contract proof. It does not implement provider adapters, traffic
routing, autonomous rebalance/hysteresis, cost event production, reservation-CAS, or double-spend
safety. Reservation-CAS remains the HOBO-379 hardening slice; this POC only records a
`reservation-intent-*` id in the dispatch decision.

## Verification

```powershell
npm.cmd --prefix src\draft\dispatcher-maximize-credits-contract test
npm.cmd test
```
