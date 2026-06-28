# ID-JAG Threat Model Spike

Independent HOBO-271 spike proof. This package records executable vectors for
the Cross-App Access ID-JAG threat model and draft-version tracking strategy
from [ADR-0097](../../../docs/design/adr/02-identity-security.md#adr-0097).

It does not mint tokens, call OAuth servers, verify JWKS, implement the
broker, or replace the HOBO-54 wire-contract package. The point is narrower:
make the threat families, fail-closed controls, draft pin, and adversarial
handoffs reviewable and testable.

Run:

```powershell
npm.cmd --prefix src\draft\id-jag-threat-model-spike test
```
