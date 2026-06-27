# Adopt-in-Place Contract

HOBO-369 proves the control-plane contract for `hobo import`, adopted nodes, and
external resource bindings without implementing real Pulumi/CDKTF import
readers or provider realization.

## Scope

- `importIacState()` maps fixture IaC state into `adopted` graph nodes.
- Adoption emits `resource.Adopted` with source provenance.
- Adopted resources are retained on destroy and reconcile only through
  drift-detect refreshes.
- `external` resources expose declared outputs for managed resource bindings.
- Binding, import collision, drift, and idempotency failures return typed errors
  or no-op outcomes.

## Guardrails

- Imported resources cannot overwrite existing managed nodes.
- Adopted resources are never planned as destroy, recreate, provision, or update
  actions.
- Destroy plans skip adopted and external resources.
- External output declarations must match the values used by managed bindings.
- Drift on adopted resources is recorded for manual remediation only.

## Verification

```powershell
npm.cmd --prefix src\draft\adopt-in-place-contract test
```
