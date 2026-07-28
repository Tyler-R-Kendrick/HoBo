---
layout: ../../layouts/Docs.astro
title: WASM & WIT surface
description: "Component Model membrane: ports as WIT, apps as components, deny-by-default capabilities, and host-supplied storage."
---

# WASM & WIT surface

HoBo’s portability **membrane** is **WIT/WASM** (Component Model / wasmCloud-shaped). TypeScript is the first reference implementation language, not a requirement for the architecture.

Do not confuse the membrane with **[App Kits](/HoBo/primitives/app-kits/)** (Bindle-declared `api`/`web`/`service`/… surfaces). Kits compose ports at authoring time; the membrane is the low-level capability boundary those ports implement.

## Why WIT

| Property | Benefit |
|---|---|
| Typed capability imports | Deny-by-default sandbox is structural |
| Host-supplied storage | Engines swap without guest SQL |
| OCI fallback | Pragmatic packaging where components are not ready |
| Same Bindle, N runtimes | Conformance-tested portability |

## Storage capability

Guests use `hobo:storage@0.1.0` — **not** filesystem paths. Hosts bind SQLite partitions or other engines. See [WIT & storage](/HoBo/reference/wit-storage/).

## Messaging capability

Publish/subscribe is **`wasi:messaging`** (`topic()`). Hosts may bind:

- Kafka / Redpanda / MSK via `@hobo/provider-kafka`
- Dapr pub/sub via optional `@hobo/runtime-dapr` (Camp opt-in)
- Local in-memory for offline tests

App code never imports Kafka or Dapr clients. See [Messaging, Kafka & Dapr](/HoBo/reference/messaging/) (ADR-0138).

## Build

`hobo build` compiles services to components; generated drift fails closed. `hobo stub` keeps contract-backed stand-ins while implementation is generated.

## Isolation dimension

WASM capability security sits beside data / compute / credentials / network isolation. Compromised guest code should not inherit ambient cloud credentials.

## Related

[Architecture](/HoBo/architecture/) · [Messaging, Kafka & Dapr](/HoBo/reference/messaging/) · [Package map](/HoBo/reference/packages/) · [Security](/HoBo/security/)
