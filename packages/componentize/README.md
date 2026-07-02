# @hobo/componentize

Deterministic TypeScript → wasm component → OCI artifact build boundary consumed by
`examples/hello-bindle` and conformance slices.

## Parse, don't validate

`componentizeHelloBindle` accepts parsed epoch + pinned toolchain inputs and returns derived
`WasmComponentArtifact` types. Raw DTOs do not cross the build seam.

## Event architecture

`ComponentBuildRequested` commands emit `ComponentBuilt` events append-only. The build result is a
projection snapshot; actors emit events and never mutate read models in place. Materialized views
and read stores persist historical snapshots for replay gates.
