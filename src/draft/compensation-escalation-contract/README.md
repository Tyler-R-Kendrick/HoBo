# HOBO-315 Compensation Escalation Contract

Independent POC for hardening compensation-of-compensation behavior from
[Plan 05](../../../docs/design/reliability-observability-cost.md#plan-05).

## Proof Surface

- `runCompensationEscalation(...)` models only the rollback failure path after the happy-path
  compensation engine has selected provisioned resources.
- The package proves terminal `needs-human` escalation, exact orphan inventory, refresh-before-give-up,
  durable notification retry, resume idempotency, retry-budget protection, timeout escalation, and
  dependency-deadlock escalation.

## Scope Boundary

This POC does not implement the production saga engine, provider adapters, SRE remediation applier,
spend breaker, or dashboard UI. It defines the hardening contract those surfaces must preserve.

## Verification

Run:

```powershell
npm.cmd --prefix src\draft\compensation-escalation-contract test
```
