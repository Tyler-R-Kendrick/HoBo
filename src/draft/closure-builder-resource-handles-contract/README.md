---
type: Reference
title: "Closure Builder Resource Handles Contract"
description: "HOBO-533/HOBO-534 proof for anonymous closure-builder resource handles, dependsOn relationships, and generated identity stability."
tags: [hobo, proof]
---

# Closure Builder Resource Handles Contract

Source issues: HOBO-533 and HOBO-534.

This proof turns the HOBO-532 public closure-builder vocabulary into an
executable handle contract for `@hobo/bindles` v1 authoring.

## Scope

- `b.cache()`, `b.queue<T>()`, and `b.api(() => app.run())`
  create anonymous resource handles with HoBo-generated IDs.
- `dependsOn()` is the only relationship verb and emits a manifest-lowering
  relationship `{ from, to, verb: "dependsOn" }`.
- Workload factories are inert descriptors during collection. The builder never
  starts imported app-host code.
- Provider `.with(...)` values are inert annotations on the resource, not new
  relationship verbs.
- Invalid dependencies fail closed with stable error codes.
- Generated IDs are kind-scoped HoBo identities such as `res_cache_0001` and
  `res_api_0001`; local variables and returned keys are aliases only.
- Identity diagnostics display alias and generated ID separately and use
  `bindle:generatedId` as the physical-name seed, never an alias.

Scope out: runtime app-host implementation, manifest lowering, generated
resource identity persistence for ambiguous same-kind insertions, codegen,
collection coverage, and end-to-end author flow proof. HOBO-538 owns the
persisted-ledger requirement for same-kind insertion stability.

## Acceptance Evidence

Run:

```powershell
corepack pnpm -C src\draft\closure-builder-resource-handles-contract test
```

The package gate runs `tsc --noEmit` over the type fixture, then the Node test
suite. It proves:

- closure-builder authoring compiles through the public handle API;
- named resource factory arguments are rejected at compile time and runtime;
- workload factories are recorded without being executed;
- invalid raw and cross-Bindle dependencies fail clearly;
- `dependsOn()` emits a manifest-lowering relationship; and
- provider `.with(...)` annotations stay inert resource annotations.
- generated IDs survive alias renames, returned-key reordering, and insertion
  of another resource kind; and
- diagnostics keep alias, generated ID, kind, owner Bindle, and physical-name
  seed as distinct fields.

## Architecture Evidence

Protobuf data shapes live in [`architecture/`](./architecture). CUE constraints
bound every protobuf type. The Pact contract under
[`architecture/pacts/`](./architecture/pacts) records the consumer/provider
expectation between downstream manifest lowering and this resource-handle proof.

Parse, don't validate: untrusted dependency inputs cross one parser boundary in
`parseDependency` and become parsed derived domain types (`ResourceHandleImpl`
or a rejected dependency error) before relationships are recorded. Core
relationship emission accepts parsed handles, not broad raw DTOs.

Event architecture:

- Command: `CollectClosureBuilderResourceHandles`.
- Events: `closureBuilder.ResourceHandlesCollected` and
  `closureBuilder.ResourceIdentityProjected`.
- Actor: the SDK contract actor owns one Bindle builder closure collection.
- Event store: accepted resource handle and relationship facts append to the
  design-contract event store.
- Materialized view / projection: manifest-lowering consumers read the resource
  and relationship projection from the collected handle facts.
- Snapshot: the current package test fixtures and Pact contract are the review
  snapshot.
- Read store: downstream HOBO-534 through HOBO-537 work reads the snapshot
  instead of reinterpreting raw issue text.
