---
type: Reference
title: "Closure Builder Resource Handles Contract"
description: "HOBO-533 proof for anonymous closure-builder resource handles and dependsOn relationships."
tags: [hobo, proof]
---

# Closure Builder Resource Handles Contract

Source issue: HOBO-533.

This proof turns the HOBO-532 public closure-builder vocabulary into an
executable handle contract for `@hobo/bindles` v1 authoring.

## Scope

- `b.cache()`, `b.queue<T>()`, `b.api(() => app.run())`, and `b.web(...)`
  create anonymous resource handles with HoBo-generated IDs.
- `dependsOn()` is the only relationship verb and emits a manifest-lowering
  relationship `{ from, to, verb: "dependsOn" }`.
- Workload factories are inert descriptors during collection. The builder never
  starts imported app-host code.
- Provider `.with(...)` values are inert annotations on the resource, not new
  relationship verbs.
- Invalid dependencies fail closed with stable error codes.

Scope out: runtime app-host implementation, manifest lowering, generated
resource identity persistence across edits, codegen, collection coverage, and
end-to-end author flow proof.

## Acceptance Evidence

Run:

```powershell
npm.cmd --prefix src\draft\closure-builder-resource-handles-contract test
```

The package gate runs `tsc --noEmit` over the type fixture, then the Node test
suite. It proves:

- closure-builder authoring compiles through the public handle API;
- named resource factory arguments are rejected at compile time and runtime;
- workload factories are recorded without being executed;
- invalid raw and cross-Bindle dependencies fail clearly;
- `dependsOn()` emits a manifest-lowering relationship; and
- provider `.with(...)` annotations stay inert resource annotations.

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
- Event: `closureBuilder.ResourceHandlesCollected`.
- Actor: the SDK contract actor owns one Bindle builder closure collection.
- Event store: accepted resource handle and relationship facts append to the
  design-contract event store.
- Materialized view / projection: manifest-lowering consumers read the resource
  and relationship projection from the collected handle facts.
- Snapshot: the current package test fixtures and Pact contract are the review
  snapshot.
- Read store: downstream HOBO-534 through HOBO-537 work reads the snapshot
  instead of reinterpreting raw issue text.
