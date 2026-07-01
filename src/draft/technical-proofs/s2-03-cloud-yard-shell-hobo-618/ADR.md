# Cloud Yard Shell — Architecture Evidence

Draft package for HOBO-618. Documents how the Yard shell Gateway turns
authenticated commands into append-only events and how the deployment timeline
projection folds those events under NFR-008 replay equivalence.

## Schema and constraints

- Protobuf shapes: [`architecture/cloud_yard_shell.proto`](./architecture/cloud_yard_shell.proto)
- CUE constraints: [`architecture/cloud_yard_shell.cue`](./architecture/cloud_yard_shell.cue)
- Gateway PACT: [`architecture/pacts/gateway_boundary.pact.json`](./architecture/pacts/gateway_boundary.pact.json)

## Parse, don't validate

`parseDeployCommand` and `authenticate` are the only ingress parsers. Downstream
Gateway, event store, and projection host code consume parsed command and
principal records — not raw HTTP/RPC bodies.

## Event architecture

| Role | This package |
| --- | --- |
| Command | `Deploy` via REST `/v1/commands/deploy` or RPC `Deploy` |
| Event | `deployment.DeployRequested` appended to `deployment:<key>` stream |
| Actor | Yard control-plane aggregate (implicit; events only, no read-model mutation) |
| Event store | Mock `@hobo/runtime-postgres` append-only streams |
| Projection | `foldDeploymentTimeline` materializes deployment timeline read model |
| Read surface | `GET /v1/read-models/deployment-timeline` |

No live Postgres, Planner, or Orchestrator is implemented here. Production
promotion to `packages/cloud/` inherits this vocabulary.
