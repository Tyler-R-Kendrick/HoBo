# ADR — S2-08 provider-cloudflare draft POC

## Parse-don't-validate

Untrusted manifest JSON crosses `parsePublishedManifest` once and becomes validated
document shapes. Provider option blocks from `cloudflare.with.*` are merged at
realize time through `mergeCloudflareResolvedOptions` in the promoted contract.

## Event architecture

`realizeHelloBindle` emits an `IacProgram` + optional `BuildSpec` through the
`RealizeEmissionBoundary` contract. Runtime apply/preview events are out of scope
for this draft POC — recorded-fixture conformance only.

## Promotion path

Promotes `src/draft/technical-proofs/provider-cloudflare-contract` and
`provider-capability-manifest-contract` into the production slot
`packages/providers/provider-cloudflare/` when S2-06 (`@hobo/iac-pulumi`) merges.
