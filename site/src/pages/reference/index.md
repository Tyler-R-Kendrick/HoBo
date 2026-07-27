---
layout: ../../layouts/Docs.astro
title: Reference overview
description: "Technical reference for HoBo packages, EventStore, contracts, effects, events, CLI, runtime ports, and WIT storage."
---

# Reference overview

This section is the **lookup manual** — precise surfaces agents and engineers open when implementing, reviewing, or debugging. Narrative learning stays in the [Guide](/HoBo/guide/); how-to testing patterns live under [Testing](/HoBo/testing/).

## Map

| Page | Use when you need |
|---|---|
| [Package map](/HoBo/reference/packages/) | Which `@hobo/*` package owns a symbol |
| [EventStore & journal](/HoBo/reference/eventstore/) | Durable log semantics, positions, fencing, SQLite default |
| [Contracts & Gatekeeper](/HoBo/reference/contracts/) | BoundaryContract, can-deploy, Gatekeeper composition |
| [Effects & resiliency](/HoBo/reference/effects/) | EffectSpec lattice, ResilienceProfile, never-retry rules |
| [Event families](/HoBo/reference/events/) | Canonical `family.Event` names for design/code |
| [CLI surface](/HoBo/reference/cli/) | Canonical verbs and roles |
| [Runtime ports](/HoBo/reference/runtime-ports/) | EventStore, Queue, Streamer, ActorHost, Clock |
| [WIT & storage](/HoBo/reference/wit-storage/) | Component-facing storage capability |
| [Glossary](/HoBo/reference/glossary/) | One-line definitions |

## Design authority

The repo’s design suite under `docs/design/` (OKF bundle) remains the long-form authority for ADRs and capability docs. This site **restates** the public developer surface without linking into raw repo paths — so Pages stays self-contained for humans and agents.

## Status honesty

Pre-release: some packages in the map are design-stage only. [Trail map](/HoBo/guide/status/) lists what runs today.
