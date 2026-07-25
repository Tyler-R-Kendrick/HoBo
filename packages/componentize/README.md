# @hobo/componentize

Deterministic TypeScript → wasm component → OCI artifact build boundary consumed by
`examples/hello-bindle` and conformance slices.

## Parse, don't validate

`componentizeHelloBindle` parses its epoch and pinned-toolchain inputs up front (failing closed on
skew or nondeterminism) and returns parsed, derived types — `WasmComponentArtifact` and
`ComponentizeResult` — so raw DTOs never cross the build seam. `validateWasmComponentArtifact`
re-parses artifact bytes and contract metadata before any consumer uses them. Wire forms live in
`data-models/componentize.proto` with CUE constraints alongside.

## Position in the event architecture

This package is a pure, deterministic build function: it hosts no actor, appends nothing to an
event store, and maintains no projection or materialized view of its own. Its artifacts enter the
control plane downstream — the build/deploy lanes that consume `@hobo/componentize` record
component digests as events, and the artifact itself is a content-addressed snapshot (digest +
contract metadata) that those read stores reference. Commands and events describing builds are
owned by the consuming packages (`@hobo/cli`, `@hobo/stage-gate`), not declared here.
