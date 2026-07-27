---
layout: ../../layouts/Docs.astro
title: Resource catalog
description: "Bindle resource factories: api, web, kv, bucket, queue, topic, secret, data, schedule, wiring with allow/with/connector/config."
---

# Resource catalog

App resources are declared in **`@hobo/bindles`** — **not** in `@hobo/core`. Names come from record keys the builder returns; explicit Bindle v1 methods do not take resource name arguments.

## Common factories

| Factory | Role |
|---|---|
| `api` / `web` / `service` | HTTP and service surfaces |
| `kv` / `bucket` | Key-value and object storage |
| `queue` / `topic` | Messaging |
| `secret` | Managed secret resource (residual; prefer secretless) |
| `data` | Portable data dependency (paradigm chosen by Matching) |
| `schedule` / `job` | Time and batch work |
| `websocket` | Realtime |
| `flag` / `auth` / `crypto` / `notify` / `guardrail` / `ui` / … | Cross-cutting catalog |

## Wiring

| Method | Role |
|---|---|
| `.allow()` | Least-privilege capability grants |
| `.with(...)` | Provider-specific optimization escape hatch |
| `connector` | External dependency protocols (e.g. A2A/ACP for agents) |
| `config` / `env` / `secretRef` / `fromBinding` | Config references |

## Lowering

Collection produces provider-agnostic **manifest IR**. Planner lowers nodes to **ResourceIntent** for Matching, cost routing, and DeploymentPlan DAGs.

## What is not a factory

- `search` is not a top-level factory (search extensions are opt-in).
- Topology (`camp`, `yard`, `junction`) is **not** re-exported from bindles.
- Stations/Trails are not Bindle resource factories.

## Related

[Bindles](/HoBo/primitives/bindles/) · [Matching](/HoBo/reference/matching/) · [Config & secrets](/HoBo/reference/config-secrets/) · [Package map](/HoBo/reference/packages/)
