# hello-bindle example — architecture evidence

## Parse, don't validate

`examples/hello-bindle/src/bindle.ts` exports a `defineHelloBindle` function consumed by the collector draft proof. Collection crosses `parseCollectionInput` once and returns parsed manifest derived types.

## Event architecture

- **Command** — `CollectHelloBindle` requests manifest IR emission.
- **Event** — `bindle.ResourcesCollected` and `bindle.ManifestProduced` append collection facts.
- **Actor** — the collector engine actor applies collection commands without mutating durable state.
- **Event store** — facts are returned to the caller; no persistence in the example package.
- **Materialized view / projection** — the golden manifest fixture is the projection snapshot.
- **Snapshot** — `contracts/manifests/hello-bindle.manifest.json` pins the snapshot bytes.
- **Read store** — downstream planner slices read the manifest IR snapshot.
