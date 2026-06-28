# HOBO-376 Partial Realize Rollback Contract

Independent POC for the M3 partial-realize rollback hardening slice from
[Plan 04](../../../docs/design/control-plane.md#plan-04),
[ADR-0004](../../../docs/design/adr/01-architecture-core.md#adr-0004), and
[ADR-0006](../../../docs/design/adr/01-architecture-core.md#adr-0006).

## Proof Surface

- `applyDeployment(...)` models ResourceActor apply over tagged provider objects and per-resource
  state.
- `rollbackDeployment(...)` proves rollback destroys recorded state plus tagged
  created-but-not-in-state orphans, and reaches `resource.CompensationFailed` plus
  `incident.EscalationRequested` when destroy fails.
- `resumePartialRollback(...)` replays the event log and resumes cleanup from
  `deployment.RolledBack`, so rollback is derived from events rather than a one-shot command.

## Scope Boundary

This POC does not implement provider adapters, production tag writers, the base ResourceActor loop,
the base compensation saga, or SRE incident handling. It composes those contracts and hardens the
partial-realize failure window.

## Verification

Run:

```powershell
npm.cmd --prefix src\draft\partial-realize-rollback-contract test
```
