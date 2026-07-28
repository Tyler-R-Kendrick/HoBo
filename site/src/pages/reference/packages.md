---
layout: ../../layouts/Docs.astro
title: Capability map
description: "Public HoBo capability surfaces: authoring, runtime ports, identity, connectivity, delivery, and operator tools."
---

# Capability map

What you use day to day — **product surfaces**, not an inventory of private implementation modules.

## Authoring

| Surface | What you use it for |
|---|---|
| **Bindles** | Pack the app: services, resources, wiring, policy intent |
| **App Kits** | Entrypoint kinds (`api`, `web`, `service`, …) inside a Bindle |
| **Camps / Yards / Junctions** | Topology: home, provider scope, federation |
| **Trails** | Continuous migration recipes when you need multi-step moves |

## Runtime (Camp)

| Surface | What you use it for |
|---|---|
| **EventStore** | Append-only domain and control facts |
| **Queue / messaging** | Deferred work and pub/sub |
| **Streamer** | High-volume frames (logs, tokens) |
| **ActorHost** | Single-writer leases and fencing |
| **Clock** | Deterministic time for workflows and tests |
| **Session Replay** | Privacy-first session capture on App Kits |

Default durable journal is a **single-owner SQLite** path. Alternate engines and component hosts (Wasmtime, OCI/Kubernetes, cloud-native) plug in behind the same ports.

## Control & identity

| Surface | What you use it for |
|---|---|
| **Stations & Conductor** | Control-plane isolation + placement decisions |
| **Gatekeeper / contracts** | can-deploy and composed deploy gates |
| **Policy packs** | Deny-by-default authorization and obligations |
| **Identity** | Workload identity, brokered tokens, continuous identity |
| **Harness** | Flags, progressive delivery, experiments |
| **Connectivity** | Named endpoints, overlay, secretless connectors |

## Operator surfaces

| Surface | What you use it for |
|---|---|
| **`hobo` CLI** | Lifecycle, diagnosis, authoring, ops |
| **MCP** | Same verbs for agents |
| **Metering** | Usage facts and showback |

## Rules of thumb

1. Author **Bindles and topology** — not storage engines. 
2. Talk to **ports** (EventStore, Queue, Messaging); engines stay swappable. 
3. Prefer **secretless** federation over long-lived keys. 
4. **Conformance** is what “certified provider” means — same bar for every adapter.

## Related

[Architecture](/HoBo/architecture/) · [Component hosts](/HoBo/reference/component-hosts/) · [Runtime ports](/HoBo/reference/runtime-ports/) · [CLI](/HoBo/reference/cli/)
