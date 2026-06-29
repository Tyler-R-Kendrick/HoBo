# HOBO-366 Drift Detection Loop Contract

Independent POC for the periodic ResourceActor resync loop. It keeps refresh and provider/IaC
implementations out of scope and proves the control-plane contract around consuming `DriftReport`
results, serializing with in-flight reconcile work, and recording auditable `resource.*` drift
transitions.

Run:

```powershell
npm.cmd --prefix src\draft\drift-detection-loop-contract test
```
