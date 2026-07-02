# ADR — Stage-6 acceptance drill (HOBO-665)

Draft package architecture-guard evidence. Production promotion deferred until S6-04/S6-07/S6-09 land.

## Decision

Stage-6 gate closes via a **scripted acceptance drill** orchestrating six release criteria plus prior-gate re-run. This POC proves the drill shape with deterministic fixtures; production wires real subsystems behind the same check IDs.

## Evidence types

- `Stage6AcceptanceDrillResult` — drill outcome snapshot
- `PriorStageGateRecord` — per-stage S0-S5 re-run status
- `GovernanceEvidenceItem` — four governance-plane proofs

## ADR-0063 compliance

Drill fails if any prior gate record is not `pass`. Adversarial `priorGateRegression` scenario locks this behavior.

## Promotion path

When S6-04 (DR), S6-07 (dashboard), and S6-09 (Operator Crew) merge, replace fixture adapters with their production seams while keeping the same `AcceptanceCheckId` enum and PACT inventory.
