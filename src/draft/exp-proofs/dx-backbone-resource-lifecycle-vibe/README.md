# DX Backbone Resource Lifecycle Vibe

This HOBO-566 proof pins the DX-first backbone for v1 vibe examples. It is an
experience proof, not production CLI/API/SDK implementation.

## Scope

- Defines the child slice graph from HOBO-567 through HOBO-577.
- Proves API, SDK, CLI/MCP, result-envelope, fixture, transcript, and quickstart
  responsibilities are covered by isolated `src/draft/exp-proofs/<slug>` packages.
- Enforces M1 shape/contract/fixture work before M2 transcript and quickstart work.
- Forces downstream docs, tutorial, dashboard, marketplace, support, launch, and
  accessibility artifacts to consume accepted DX source material.
- Keeps `live`, `simulated`, `reference fixture`, and `scope-out` as the closed
  proof-mode vocabulary.

## Non-Scope

No production CLI parser, REST endpoint, SDK package, live provider call, real
credential, customer data, final product copy, public launch claim, or UI-first
dashboard behavior is implemented here.

## Proof Command

```powershell
npm.cmd --prefix src\draft\exp-proofs\dx-backbone-resource-lifecycle-vibe test
```

## Mocked Boundaries

- Linear child issue state is represented by a deterministic local record.
- Production CLI/API/SDK/runtime/provider surfaces are not invoked.
- Downstream artifact consumers are modeled as gates that must consume HOBO-577
  quickstart evidence rather than inventing behavior.

## Contract Evidence

- `architecture/dx_backbone_resource_lifecycle.proto`
- `architecture/dx_backbone_resource_lifecycle.cue`
- `architecture/pacts/dx-backbone-resource-lifecycle.pact.json`
