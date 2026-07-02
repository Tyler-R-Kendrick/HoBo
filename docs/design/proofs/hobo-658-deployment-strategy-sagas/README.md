---
type: Reference
title: "HOBO-658 Deployment Strategy Saga Orchestrator Proof"
description: "Proof record for S6-03 per-service deployment strategy sagas draft POC"
tags: [hobo, design, proof]
---

# HOBO-658 Deployment Strategy Saga Orchestrator Proof

Executable POC:
[`src/draft/epic-proofs/deployment-strategy-saga-orchestrator`](../../../../src/draft/epic-proofs/deployment-strategy-saga-orchestrator/README.md)

## Acceptance mapping

| Acceptance | Evidence |
|---|---|
| Per-service strategy selection (recreate/blue-green/canary/progressive) | `selects recreate, blue-green, canary, and progressive templates per service` |
| Each strategy deploys multi-cloud-shop reference app green | `deploys multi-cloud-shop reference app green for every strategy in CI` |
| Seeded canary regression auto-rolls back event-sourced | `auto-rolls back seeded canary regression on multi-cloud-shop with event-sourced decision` |
| Health-gated promotion from data-plane + provider signals | `health-gates promotion from data-plane and provider health signals` |
| Golden-suite failure adversarial guard | `rolls back on golden-suite failure adversarial case` |

## Verify

```bash
pnpm --prefix src/draft/epic-proofs/deployment-strategy-saga-orchestrator test
```

Production target remains `packages/cloud/src/orchestrator/` after S6-01 acceptance record merges.
