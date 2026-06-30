---
type: Reference
title: "Closure Builder Public API"
description: "Canonical v1 public API contract for explicit Bindle authoring through @hobo/bindles."
tags: [hobo, design]
---

# Closure Builder Public API

Source issues: HOBO-532, HOBO-533, HOBO-534, and HOBO-535. This record is the v1 public contract for
explicit Bindle authoring in `@hobo/bindles`. It replaces pre-release
factory-object assembly examples with a closure builder that has one vocabulary
for agents, docs, and downstream implementation slices.

## Contract

```ts
import { bindle } from "@hobo/bindles";
import myApi from "@myproject/services";

export default bindle("shop", (b) => {
  const cache = b.cache();
  const api = b.api(() => myApi.run()).dependsOn(cache);

  return { cache, api };
});
```

- `bindle(name, builderFn)` belongs to `@hobo/bindles`.
- Bindle assembly creates provider-agnostic manifest objects. It is not an app
  host, request router, runtime, worker process, or framework adapter.
- Imported app-host or framework code owns request handling and process/runtime
  behavior.
- Resource builder methods such as `b.cache()`, `b.queue<T>()`, and
  `b.api(() => importedApp.run())` do not take resource name arguments in v1.
- Resource identity is HoBo-generated. Local variables and returned object keys
  are aliases for authoring, generated types, and downstream examples only.
- Generated identity is surfaced separately from aliases in diagnostics and
  physical naming seeds derive from the generated ID, not the local alias.
- `dependsOn()` is the only v1 relationship verb and records a manifest-lowering
  relationship between handles.

## Scope

This contract pins public API vocabulary, package ownership, relationship
spelling, app-host boundary language, generated-identity separation, and the
first manifest-lowering proof for downstream HOBO-533 through HOBO-537 work.

Out of scope: runtime app-host behavior, provider resolution, production
codegen, collection coverage, and end-to-end author flow proof.

## Proof

The public API vocabulary proof lives in
[`../../src/draft/closure-builder-public-api-contract`](../../src/draft/closure-builder-public-api-contract/README.md).
It includes TypeScript contract tests, protobuf shapes, CUE constraints, and a
Pact expectation for downstream SDK implementation work.

The resource-handle proof lives in
[`../../src/draft/closure-builder-resource-handles-contract`](../../src/draft/closure-builder-resource-handles-contract/README.md).
It proves anonymous handle creation, inert workload descriptors, invalid
dependency refusal, `dependsOn()` relationship emission, and inert provider
annotations. The same proof now covers HOBO-534 generated-ID stability and alias
separation diagnostics.

The manifest-lowering proof lives in
[`../../src/draft/closure-builder-manifest-lowering-contract`](../../src/draft/closure-builder-manifest-lowering-contract/README.md).
It proves captured closure-builder facts lower to `hobo:sdk` calls and
`hobo.manifest/v1` while keeping aliases out of deployment identity and leaving
same-kind identity-ledger behavior to HOBO-538.
