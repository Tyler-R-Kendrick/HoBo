---
layout: ../../layouts/Docs.astro
title: WASM & WIT surface
description: "Component Model membrane: ports as WIT, apps as components, deny-by-default capabilities, and host-supplied storage."
---

# WASM & WIT surface

HoBo’s portability membrane is **WIT/WASM** (Component Model / wasmCloud-shaped). TypeScript is the first reference implementation language, not a requirement for the architecture.

## Why WIT

| Property | Benefit |
|---|---|
| Typed capability imports | Deny-by-default sandbox is structural |
| Host-supplied storage | Engines swap without guest SQL |
| OCI fallback | Pragmatic packaging where components are not ready |
| Same Bindle, N runtimes | Conformance-tested portability |

## Storage capability

Guests use `hobo:storage@0.1.0` — **not** filesystem paths. Hosts bind SQLite partitions or other engines. See [WIT & storage](/HoBo/reference/wit-storage/).

## Build

`hobo build` compiles services to components; generated drift fails closed. `hobo stub` keeps contract-backed stand-ins while implementation is generated.

## Isolation dimension

WASM capability security sits beside data / compute / credentials / network isolation. Compromised guest code should not inherit ambient cloud credentials.

## Related

[Architecture](/HoBo/guide/architecture/) · [Package map](/HoBo/reference/packages/) · [Security](/HoBo/guide/security/)
