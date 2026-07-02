# @hobo/bindles

Minimal v1 closure-builder surface for explicit Bindle authoring. Assembly creates
provider-agnostic manifest objects only — no runtime semantics (ADR-0072).

## Parse, don't validate

`bindle()` returns frozen `BindleManifest` derived types. Invalid dependency handles are
unrepresentable past the builder seam.

`pnpm --filter @hobo/bindles run test:schema` vets manifest fixtures with `HOBO_CUE_BIN`,
the root `.tools/cue/v0.14.0/` cache populated by `pnpm run test:schema`, or `cue` on `PATH`.

## Event architecture

Bindle collection is modeled as a command that emits manifest snapshot events for downstream
lowering actors. Projections materialize resource descriptors and `dependsOn` relationships;
snapshots land in the read store for SDK slices — actors emit events and never mutate read models
in place.
