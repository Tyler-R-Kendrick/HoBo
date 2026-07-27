---
layout: ../../layouts/Docs.astro
title: Naming & endpoints
description: "Hierarchical DNS-valid names, .hobo.localhost / .hobo.test zones, getNamedEndpoint, portless local endpoints, and multi-tenant labels."
---

# Naming & endpoints

HoBo names are **pure functions** of tenant/project/env/service labels — never free-form strings that invent a private TLD. Implementation lives in `@hobo/core` (`getNamedEndpoint`, `getNamedEndpointHost`, `sanitizeDnsLabel`) and is consumed by `@hobo/connectivity` for registration, DNS, and overlay.

## Hard rules

| Rule | Why |
|---|---|
| **Never emit bare `.hobo`** | Not a public TLD; code that does is a bug |
| **Local zone** | `*.hobo.localhost` (default local TLD `localhost`) |
| **Overlay zone** | `*.hobo.test` (default overlay TLD `test`) |
| **DNS-valid labels** | `sanitizeDnsLabel` — lowercase, length-capped, no illegal chars |
| **Hierarchical** | Tenant → project → env → service (and optional branch) compose the host |
| **Prod env omission** | Default omitted env is `prod` so production hosts stay short |

## Modes

```ts
type NamedEndpointMode = "local" | "overlay";
```

- **local** — machine-local resolution; pairs with optional **portless** local named endpoints when the connectivity host supports them.
- **overlay** — Tailscale/Netbird-class mesh names under `.hobo.test`.

Port-based URLs remain the default offline path. Force ports with `HOBO_PORTLESS=0`.

## Multi-tenant context

Soft multi-tenancy labels (also used by policy and metering):

| Env var | Role |
|---|---|
| `HOBO_TENANT` | Platform tenant / org |
| `HOBO_PROJECT` | Project |
| `HOBO_BRANCH` | Branch / preview lane |
| `HOBO_ENV` | Environment (`prod` often omitted in host) |

When `requireTenant` is set on `NamedEndpointParams`, empty tenant fails closed.

## Who registers names

- **Connectivity host** — local registration of named endpoints for `hobo dev`.
- **Pluggable DNS** — public managers (e.g. Route53, Cloudflare adapters) and memory providers for tests.
- **Junction dynamic DNS** — cross-yard service discovery without shared mutable state.

Workloads dial **named endpoints only** for secretless connectors — never receive raw material or ad-hoc host strings from operators.

## Related

[Security](/HoBo/guide/security/) · [Connectivity](/HoBo/reference/connectivity/) · [Camps](/HoBo/primitives/camps/) · [Stations](/HoBo/primitives/stations/)
