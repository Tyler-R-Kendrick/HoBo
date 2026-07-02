# ADR: Full Dashboard Projection Views Contract

## Status

Accepted for HOBO-662 proof work.

## Context

S6-07 requires `apps/dashboard` to render every Plan 07 view from projections only for
`examples/multi-cloud-shop`, pass WCAG 2.1 AA, and pass pseudo-localization (200% string length,
RTL) per NFR-016. Blockers S6-05 and S6-06 are not merged, so this proof composes projection
fixtures from `cli-mcp-developer-experience` and `reliability-observability-cost-finops` epic
references without importing unmerged production runtime.

## Decision

The proof is a projection-only dashboard renderer over a deterministic `multi-cloud-shop` event
fixture. Each view maps to a named projection source (`DeploymentView`, `TopologyView`, `RunView`,
`Registry`, `CredentialAudit`, `CostView`, `DriftView`, `PlanPreviewView`, `PolicyGateView`,
`CampPointerView`, `StreamView`). HTML rendering and audits are fixture-backed acceptance gates,
not production Next.js UI.

## Consequences

- Downstream `apps/dashboard` work inherits a machine-checkable view inventory and audit gates.
- WCAG and pseudo-loc checks run in CI without browser farms.
- FinOps and drift semantics remain fixture-level until S6-05/S6-06 merge.

## Parse Boundary

Unknown dashboard render input crosses `parseDashboardRenderResult` once and becomes
`ParsedDashboardRenderResult`. View payloads are derived from projection events; callers do not
re-validate broad DTOs after parse.

## Event Architecture

Command: `RenderFullDashboardFromProjections`. Source events include `deployment.*`, `topology.*`,
`run.*`, `registry.*`, `credential.*`, `policy.*`, `cost.*`, `drift.*`, and `stream.*` families
from the multi-cloud-shop fixture. Actors are projection actors only; this proof does not implement
event stores, materialized views, or Gateway subscriptions.

## Alternatives Rejected

- Build production `apps/dashboard` in this issue: rejected — blockers not merged and scope is proof-first.
- Skip WCAG/pseudo-loc gates: rejected — NFR-016 is explicit acceptance for stage 6 dashboard work.

## Performance Applicability

Not applicable. Deterministic in-memory fixture composition only.
