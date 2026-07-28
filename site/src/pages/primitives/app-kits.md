---
layout: ../../layouts/Docs.astro
title: App Kits
description: "App Kit (Kit): Bindle-declared application surfaces — api, web, service, ui, websocket, job, wasm-component. Prefer Kit over membrane type at authoring; WIT membrane stays the low-level portability contract."
---

# App Kits

An **App Kit** (short: **Kit**) is a Bindle-declared **application surface** — the kinds that host entrypoints or interactive runtime behavior.

Prefer **Kit** / **App Kit** at the Bindle authoring layer. Do **not** call these "membrane types." The **WIT/WASM membrane** (ADR-0069 / wRPC) is the *low-level* portability contract between components and capability providers; Kits are the *app-facing* composition of ports into something you pack in a Bindle.

## App Kit kinds

| Label | Kind | Role |
|---|---|---|
| API Kit | `api` | HTTP API entrypoint |
| Web Kit | `web` | Web / HTML entrypoint |
| Service Kit | `service` | Long-running HTTP service |
| UI Kit | `ui` | UI render surface |
| Realtime Kit | `websocket` | Realtime rooms / sockets |
| Job Kit | `job` | Batch / async work |
| Component Kit | `wasm-component` | Wasm component dependency as surface |

Package constants: `APP_KIT_KINDS`, `isAppKitKind`, `appKitLabel` from `@hobo/bindles`.

## Infra Kits (not App Kits)

Infrastructure/port resources that are **not** entrypoint hosts:

`kv` · `bucket` · `queue` · `topic` · `secret` · `data` · `schedule` · `external` · `container` · `flag` · `auth` · `crypto` · `notify` · `guardrail` · `golden` · `experiment` · `rollout`

See `INFRA_KIT_KINDS` in `@hobo/bindles`.

## HTTP App Kits

Subset of App Kits that local Yard hosts serve as fetch handlers:

`api` · `web` · `service` · `ui` — `HTTP_APP_KIT_KINDS` / `isHttpAppKitKind`.

## Session Replay

**Every App Kit** is Session-Replay capable by default (ADR-0137): privacy-first capture, dual fixtures locally, progressive gating in production. Infra Kits are not auto-annotated.

Opt out per Kit:

```ts
import { sessionReplay } from "@hobo/bindles";

b.api(handler).with(sessionReplay({ enabled: false }));
```

Kill switch: `HOBO_REPLAY=0`. Full surface: [Session Replay](/HoBo/reference/session-replay/).

## Naming split

| Term | Layer | Meaning |
|---|---|---|
| **App Kit** | Bindle authoring | Entrypoint-bearing resource kinds |
| **Infra Kit** | Bindle authoring | Port / infrastructure resources |
| **Membrane** | Runtime substrate | WIT/WASM + wRPC capability boundary |

## Related

[Bindles](/HoBo/primitives/bindles/) · [Resource catalog](/HoBo/primitives/resources/) · [Session Replay](/HoBo/reference/session-replay/) · [WASM & WIT](/HoBo/architecture/wasm/) · [Core concepts](/HoBo/guide/concepts/)
