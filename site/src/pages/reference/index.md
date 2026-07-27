---
layout: ../../layouts/Docs.astro
title: Reference overview
description: "Technical reference for HoBo packages, ports, contracts, effects, identity, connectivity, CLI, events, and errors."
---

# Reference overview

This section is the **lookup manual** — precise surfaces agents and engineers open when implementing, reviewing, or debugging. Narrative learning stays in the [Guide](/HoBo/guide/); how-to testing patterns live under [Testing](/HoBo/testing/).

## Map

| Page | Use when you need |
|---|---|
| [Package map](/HoBo/reference/packages/) | Which `@hobo/*` package owns a symbol |
| [Component hosts](/HoBo/reference/component-hosts/) | wasm / oci / cloud-native hosts vs EventStore engines |
| [EventStore & journal](/HoBo/reference/eventstore/) | Durable log, positions, fencing, SQLite default |
| [Schema & migrations](/HoBo/reference/schema/) | `user_version`, tables, codecs, integrity |
| [Queue](/HoBo/reference/queue/) · [Streamer](/HoBo/reference/streamer/) · [Clock](/HoBo/reference/clock/) | Other Camp ports |
| [ActorHost & fencing](/HoBo/reference/actor-host/) | Leases and fence tokens |
| [Runtime ports](/HoBo/reference/runtime-ports/) | Port coupling summary |
| [Contracts & Gatekeeper](/HoBo/reference/contracts/) | IR, can-deploy, composition |
| [Effects & resiliency](/HoBo/reference/effects/) | EffectSpec, ResilienceProfile |
| [Policy plane](/HoBo/reference/policy/) | Packs, obligations, deny ceilings |
| [Matching & ResourceActors](/HoBo/reference/matching/) | Placement + reconciliation |
| [Harness & progressive](/HoBo/reference/harness/) | Flags, experiments, lanes |
| [Errors & codes](/HoBo/reference/errors/) | Stable machine codes |
| [Event families](/HoBo/reference/events/) | Canonical event names |
| [CLI surface](/HoBo/reference/cli/) | Canonical verbs |
| [WIT & storage](/HoBo/reference/wit-storage/) | Component storage capability |
| [Identity](/HoBo/reference/identity/) · [Naming](/HoBo/reference/naming/) · [Connectivity](/HoBo/reference/connectivity/) | Identity + network substrate |
| [Config & secrets](/HoBo/reference/config-secrets/) · [Metering](/HoBo/reference/metering/) | Secretless config + usage facts |
| [Session Replay](/HoBo/reference/session-replay/) | DOM/session reconstruction (`@hobo/replay`, ADR-0137) |
| [Glossary](/HoBo/reference/glossary/) | One-line definitions |

## Design authority

The repo’s design suite under `docs/design/` (OKF bundle) remains the long-form authority for ADRs and capability docs. This site **restates** the public developer surface without linking into raw repo paths — so Pages stays self-contained for humans and agents.

## Status honesty

Pre-release: some packages in the map are design-stage only. [Trail map](/HoBo/guide/status/) lists what runs today.
