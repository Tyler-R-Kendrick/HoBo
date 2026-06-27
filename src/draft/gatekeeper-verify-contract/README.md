# Gatekeeper Verify Contract

Independent POC for HOBO-146.

This package proves the Plan 29 Gatekeeper composition contract for
`hobo verify --target <env>`:

- `can-deploy` is one gate result inside a larger composite decision;
- all required gate engines must supply results from their own engine source;
- any failing required gate blocks with that gate's reason and suggested fix;
- each gate result and the composite decision are replayable from emitted events;
- missing or errored gate engines fail closed;
- caller-supplied gate results are ignored;
- prod deny-ceiling can make the golden suite impossible to disable;
- incident remediation may bypass only the burn-freeze dimension, never
  contracts, policy, conformance, cost, signing, golden suite, or plan validity.

Scope intentionally stops before implementing the individual gate engines. The
package consumes engine-owned gate outputs and composes them.

Run:

```powershell
npm.cmd --prefix src\draft\gatekeeper-verify-contract test
```
