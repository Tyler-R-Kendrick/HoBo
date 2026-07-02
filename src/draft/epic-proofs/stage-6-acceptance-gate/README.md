# Stage-6 Acceptance Gate Reference Implementation

Epic rollup for **HOBO-665** (S6-10): scripted Stage-6 acceptance drill closing v1 GA readiness.

Independent draft POC — mocks every subsystem boundary. Does not import unmerged blocker code from S6-04/S6-07/S6-09.

## Vertical slice

```gherkin
Feature: Stage-6 acceptance drill

  Persona: Release engineer

  Scenario: Close v1 GA readiness
    Given mocked canary, FinOps, DR, dashboard, governance, and prior-gate fixtures
    When the Stage-6 acceptance drill runs in CI
    Then all six release-criteria checks pass
    And prior gates S0-S5 re-run green (ADR-0063)
    And evidence attaches to the S6-01 acceptance record with v1 GA checklist complete
```

## Acceptance mapping (HOBO-665)

| Criterion | Mock boundary | Adversarial scenario |
|---|---|---|
| Canary auto-rollback | `pact-canary-rollback.json` | `rollbackCompensationFailure` |
| Plan-time cost ±20% | `pact-finops-cost-estimate.json` | `costOutOfTolerance` |
| DR rebuild < 15 min RTO | `pact-dr-replay-rebuild.json` | `drRtoExceeded` |
| Dashboard WCAG 2.1 AA + pseudo-loc | `pact-dashboard-a11y-audit.json` | `dashboardAuditFailure` |
| Four governance evidence items | `pact-governance-plane.json` | `governanceBypass` |
| Prior gates S0-S5 green | `pact-prior-stage-gates.json` | `priorGateRegression` |

## Running

```bash
pnpm --prefix src/draft/epic-proofs/stage-6-acceptance-gate test
pnpm --prefix src/draft/epic-proofs/stage-6-acceptance-gate run simulate
```

## References

- [requirements.md Release criteria Stage 6](../../../../docs/archive/requirements/requirements.md)
- [roadmap.md Stage 6](../../../../docs/archive/roadmap.md)
- [ADR-0063](../../../../docs/design/adr/07-portability-extensibility.md#adr-0063) keep-prior-gates-green
- Proof note: [`docs/design/proofs/hobo-665-stage-6-acceptance-gate/README.md`](../../../../docs/design/proofs/hobo-665-stage-6-acceptance-gate/README.md)

## Architecture evidence

- `architecture/` — protobuf + CUE for drill result records
- `architecture/pacts/` — package boundary PACT
- `architecture.md` — parse-don't-validate and event-architecture notes
