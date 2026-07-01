# ADR: DX-First Resource Lifecycle Backbone

## Decision

HOBO-566 treats the API/SDK/CLI/MCP resource lifecycle as the source material
for v1 vibe examples. Visual, support, docs, launch, marketplace, and
accessibility artifacts must consume the accepted DX quickstart, scenario
matrix, result envelopes, and fixture corpus instead of inventing product
behavior.

## Context

The design anchors define `hobo up`, `hobo plan`, `hobo collect`, inspect/log
projections, WIT-first SDK object graphs, DeploymentPlan/Set/Delta, Gatekeeper,
ResourceActor, and `migration.*` events. Those are enough to build branch-sized
experience proofs without shipping production surfaces.

## Consequences

- M1 shape and fixture slices precede M2 transcript/prototype slices.
- HOBO-577 is the canonical downstream quickstart source.
- Proof-mode labels are closed: `live`, `simulated`, `reference fixture`, and
  `scope-out`.
- Scope-out requests fail closed when they ask for production CLI/API/SDK, live
  providers, real credentials, customer data, or launch claims without evidence.

## Performance Applicability

Performance is not applicable to this coordination proof. Later transcript and
fixture packages can add deterministic timing expectations when they model CLI
or API execution.
