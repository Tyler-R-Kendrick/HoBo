# S2 Stage Gate Drill — Architecture Evidence

Draft package for HOBO-626. Documents how the stage-gate drill parses contract
input once and names the event-sourced deployment lifecycle vocabulary.

## Schema And Constraints

- Protobuf shapes: [`architecture/`](./architecture).
- CUE constraints bound every protobuf type.
- PACT contract: [`architecture/pacts/`](./architecture/pacts).

## Parse, Don't Validate

Untrusted drill configuration crosses one parser boundary via
`createS2StageGateDrillContract()` + `validateS2StageGateDrillContract()`.
Downstream simulators receive frozen contract objects, not raw DTOs.

## Event Architecture

The drill models Yard deployment as append-only events:

- **Command** — `Deploy` / `Promote` / `Destroy` through the Gateway.
- **Event** — `deployment.*`, `exec.*`, `saga.*`, `policy.*`, `compat.*`.
- **Actor** — ResourceActor and Orchestrator emit events; no direct read-model mutation.
- **Projection** — `reconstructDeploymentTimeline()` folds the log into a timeline view.
- **Resume** — `simulateYardRestartResume()` replays the tail after `yard.ProcessTerminated`.

No runtime engine is implemented here; this is design-time evidence for S2-11.
