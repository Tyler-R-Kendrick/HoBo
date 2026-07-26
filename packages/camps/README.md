# @hobo/camps

Production home of `camp()`, `providerSelection()`, resolution-precedence
descriptors (`resolutionPrecedenceFor`), and offline `resolveLocalBindings` for
local Camp development. A Camp maps a provider-agnostic Bindle onto exactly one
provider; the package normalizes that mapping into immutable value objects.
See [`ADR.md`](./ADR.md).

## Honest scope

Implemented: parsing/normalizing camp configs into frozen `Camp` and
`ProviderSelection` values, precedence tables (`ResolutionPrecedenceRecord`),
canonical manifest hashing (`canonicalManifestHash`, sorted-key sha256), and
`resolveLocalBindings`, which substitutes lazy `${resource.property}` tokens in
a `WiringManifest`'s env through a caller-supplied `BindingResolverPort` — and
refuses any camp whose provider is not `local`. Not here: no deployment, no
cloud provider calls, no binding resolver implementation of its own.

## Commands

```bash
pnpm --filter @hobo/camps run build
pnpm --filter @hobo/camps run typecheck
pnpm --filter @hobo/camps run lint
pnpm --filter @hobo/camps run test
```

## Parse, don't validate

Untrusted provider-mapping input crosses the `providerSelection(...)` and
`camp(...)` parser boundaries and becomes deep-frozen derived types
(`ProviderSelection`, `Camp`, `ResolutionPrecedenceRecord`); ids and env names
are normalized once at construction, resolution failures throw
`BindingResolutionError`, and downstream functions accept parsed `Camp` values,
never raw DTOs — parse, don't validate. Wire forms live in
`data-models/topology_camp.proto` with CUE constraints alongside.

## Position in the event architecture

This package hosts no actor and appends nothing to an event store itself — a
`Camp` is an immutable value object. In the platform model it is the snapshot
carried on the `topology.CampComposed` event: composing a camp is the command,
the composition actor and event store live upstream in the deployment stream,
a camp-registry projection folds composed camps into the read model, and
`resolveLocalBindings` is a read-side consumer of that mapping for local dev.
