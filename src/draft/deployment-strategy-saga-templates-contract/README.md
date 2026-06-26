# Deployment strategy saga templates contract POC

This draft pins the Harness-side strategy templates that turn a service rollout into replayable
`rollout.*` saga events over the `hobo:delivery` gateway seam.

## Contract

- `canaryStrategy(...)` and `progressiveStrategy(...)` compile staged traffic-shift steps that call
  the gateway with idempotent `gateway.shiftTraffic` commands and consume health, SLO-burn, and
  Golden-suite gate signals.
- `blueGreenStrategy(...)` compiles a green-slot prepare, pre-flip health gate, router flip, and
  retain-blue soak step for fast rollback.
- `recreateStrategy(...)` compiles stop-old, start-new, and route-new steps behind a health gate.
- `createDeploymentStrategySaga(...).run(...)` emits CloudEvents-shaped `rollout.Started`,
  `rollout.Stepped`, `rollout.GateEvaluated`, `rollout.Failed`, `rollout.RolledBack`, and
  `rollout.Promoted` events compatible with the delivery-orchestrator skeleton replay contract.
- `replayGatewayState(events)` rebuilds the gateway-facing state from the emitted rollout events.

## Scope boundary

This POC does not compute SLO burn rates, run Golden suites, implement provider deploy adapters,
enforce deploy freezes, or apply AI live fixes. It only consumes injected gate signals and executes
provider-agnostic gateway/deployment commands.

## Verify

```powershell
npm.cmd --prefix src\draft\deployment-strategy-saga-templates-contract test
```
