---
layout: ../../layouts/Docs.astro
title: FinOps operator
description: "Crew FinOps: forecasts, anomaly signals, commitment recommendations — advisory only, never auto-purchasing cloud savings plans."
---

# FinOps operator

**Mission:** forecasts · anomaly signals · commitment recommendations · optimization proposals — **advisory-only**.

## What it does

- Reads MeteringView / showback / credit ledger projections.
- Emits recommendations as `crew.ActionProposed` with require-approval obligations.
- MCP: `forecast`, `recommend-commitment`, `propose-optimization`.
- **Never** auto-purchases savings plans or mutates billing without policy + human path.

## What enforces cost

Enforcement stays with spend breakers, costAvailabilityProfile tiers, and Gatekeeper cost/quota — not silent FinOps side effects. SRE may handle cost-induced degradation as an incident class; FinOps advises.

## Events

Rides `crew.*`, `spend.*`, `cost.*`, `policy.Decided`. Recommendations are replayable decisions.

## Related

[SRE](/HoBo/crew/sre/) · [Shared model](/HoBo/crew/shared-model/) · [Gatekeeper cost gate](/HoBo/reference/contracts/)
