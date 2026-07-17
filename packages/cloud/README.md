# @hobo/cloud — the Yard control-plane kernel + Planner

Production package for **S2-01** (Yard kernel) and **S2-02** (Planner + Matching)
of the [engineering build plan](../../docs/plans/0003-engineering-build-plan.md),
implementing [`docs/design/control-plane.md`](../../docs/design/control-plane.md).

A coherent vertical: a **Deploy command** becomes past-tense **events**, the pure
**Planner** resolves them to a content-addressed `DeploymentPlan` DAG, and a
**materialized view** (projection) reconstructs deployment state from the log.

## Architecture

- **Gateway** (`src/gateway/`) — command ingress. Authenticates + authorizes the
  principal, turns a `Deploy` command into facts, and serves read models.
  Commands are never stored; only past-tense events are appended.
- **Store** (`src/store/`) — the core **EventStore** port (an append-only event
  store) backed by runtime-local's sqlite engine in tests (Decision D6). The
  aggregate write path runs as a single-writer **actor** via the ActorHost lease.
- **Projections** (`src/projections/`) — built on `@hobo/data`'s `defineProjection`.
  The **DeploymentView** read store rebuilds from zero; a **snapshot** is only a
  cache, never a source of truth. Emits `projection.*`.
- **Registry** (`src/registry/`) — a catalog **projection** over provider
  `capabilityManifest()` publications (Decision D2), plus the `PlannerRegistry`
  the Planner consults.
- **Planner** (`src/planner/`) — the pure function
  `plan(bindle, config, registry) → DeploymentPlan` (6 steps): lower manifest IR →
  `ResourceIntent`; collect bind-edge DAG; resolve a Resource Definition per
  resource (recording `match.Decided`); capability negotiation via the provider
  `Capability.satisfies`; region/colocation; min-cost objective ranking with a
  stable tiebreak. Unsatisfiable resources emit `deployment.PlanRejected` with a
  machine-readable remediation.

### Records: parse, don't validate

Records, messages, data shapes, and objects are defined in protobuf
(`data-models/cloud.proto`) with CUE constraints (`data-models/cloud.cue`). The
TypeScript domain types are **parsed derived types** (parse, don't validate): the
constructors in `src/plan-types.ts` are the only way to build a plan value, so
downstream code never re-validates a raw record.

### Event catalog

`deployment.Requested` · `match.Decided` · `deployment.Planned` ·
`deployment.PlanRejected` · `provider.Registered` (per-resource subjects like
`match.Decided:<resource>` are carried in the fact body, since the core envelope
type pattern forbids a colon in the type string).

## Gates

```sh
unset NODE_OPTIONS
pnpm --filter @hobo/cloud run build      # tsc
pnpm --filter @hobo/cloud run test       # vitest
pnpm run architecture:guard              # boundary/records/PACT evidence
```
