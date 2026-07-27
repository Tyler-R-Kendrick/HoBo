---
layout: ../../layouts/Docs.astro
title: Testing overview
description: "How HoBo makes testing unfamiliar-but-powerful: contract-derived mocks, effect-aware isolation, durable EventStore proofs, bridge modes, and offline deployment rehearsal."
---

# Testing overview

> *Trust the bindle, test the journey — without a cloud account until you want one.*

HoBo collapses a lot of “special testing tools” into one idea: **every boundary is typed and contract-backed**, so you can point it at a different **mode** (live, mock, replay, bridge, shadow, fault) without rewriting the app. The patterns below are deliberate product features, not ad-hoc test helpers.

## Mental model

| Idea | What it buys you |
|---|---|
| **Contracts bound shape** | Consumer-driven expectations; providers can grow without breaking consumers |
| **Boundary modes** | Same production code path, different routing (mock / live / replay / bridge / shadow / fault) |
| **EffectSpec** | Pure work isolates with zero infra; domain I/O drives automatic mocks |
| **ResilienceProfile** | Fault-injection guided by the contract; never retries policy denials or terminal failures |
| **Event log** | Replay-equals-live; inspection without re-running side effects |
| **SQLite journal** | Real durability semantics offline (CAS, fencing, atomic effects) |

## Layers (read in this order)

1. **[Unit tests & boundaries](/HoBo/testing/unit/)** — vitest-style tests; boundaries auto-mock from contract examples.
2. **[Contracts & PACT](/HoBo/testing/contracts/)** — consumer/provider executable contracts; subset matching.
3. **[Effect-aware isolation](/HoBo/testing/effects/)** — pure vs domain-effect harness modes (ADR-0136).
4. **[Durable EventStore](/HoBo/testing/durability/)** — stream-head CAS, fencing, positions, migration, restart (ADR-0135).
5. **[Deployment rehearsal](/HoBo/testing/deployment/)** — `hobo plan`, local lane, can-deploy / Gatekeeper.
6. **[Bridge modes](/HoBo/testing/bridge-modes/)** — live/mock/bridge/replay/shadow/fault session routing.
7. **[Chaos & availability](/HoBo/testing/chaos/)** — session-scoped faults, synthetics, SLOs as projections.
8. **[Conformance & golden](/HoBo/testing/conformance/)** — port suites, golden suite as a deploy gate.

## What you should *not* do

- Hand-write long-lived mocks that drift from contracts — use contract examples / effect harness mocks.
- Treat `COUNT(*)` stream length or multi-writer shared SQLite as “the real” store — the product uses stream heads and single-owner partitions.
- Retry `policy.Decided` denials or terminal WIT failures in tests “to be resilient” — that is a **bug** in the product model.
- Run broad full-repo test sweeps to discover code — search first, then narrow package tests.

## Related

- [Architecture](/HoBo/guide/architecture/) — EventStore default, package map.
- [The Bridge](/HoBo/guide/bridge/) — local/remote development on the same modes.
- [Reference: effects](/HoBo/reference/effects/) · [EventStore](/HoBo/reference/eventstore/) · [contracts](/HoBo/reference/contracts/)
