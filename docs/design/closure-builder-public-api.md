---
type: Reference
title: "Closure Builder Public API"
description: "Canonical v1 public API contract for explicit Bindle authoring through @hobo/bindles."
tags: [hobo, design]
---

# Closure Builder Public API

Source issue: HOBO-532. This record is the v1 public contract for explicit
Bindle authoring in `@hobo/bindles`. It replaces pre-release factory-object
assembly examples with a closure builder that has one vocabulary for agents,
docs, and downstream implementation slices.

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
- `dependsOn()` is the only v1 relationship verb.

## Scope

This contract pins public API vocabulary, package ownership, relationship
spelling, and app-host boundary language for downstream HOBO-533 through
HOBO-537 work.

Out of scope: runtime app-host behavior, manifest lowering, generated resource
identity implementation, codegen, collection coverage, and end-to-end author
flow proof.

## Proof

The executable proof lives in
[`../../src/draft/closure-builder-public-api-contract`](../../src/draft/closure-builder-public-api-contract/README.md).
It includes TypeScript contract tests, protobuf shapes, CUE constraints, and a
Pact expectation for downstream SDK implementation work.
