---
layout: ../../layouts/Docs.astro
title: Runtime ports
description: "Camp durable ports: EventStore, Queue, Streamer, ActorHost, and Clock — and how they relate."
---

# Runtime ports

A **Camp** provides the durable substrate app runtimes need. Ports live in `@hobo/core`; engines implement them.

| Port | Responsibility |
|---|---|
| **EventStore** | Append-only facts, stream read, live subscribe, snapshots |
| **DurableEventStore** | Positions, transactional effects, durable checkpoints |
| **Queue** | Enqueue/lease/complete with idempotency; actor `signal` mapping |
| **Streamer** | High-volume frames **outside** the domain event log |
| **ActorHost** | Single-writer lease + monotonic `fenceToken` |
| **Clock** | Deterministic virtual time + sleep/cron for replay |

## Coupling rules

- Aggregates acquire **ActorHost** leases and pass **fenceToken** into EventStore append/commit.
- Queue/timer/outbox may stage inside the EventStore journal transaction when durability is configured.
- Streamer frame bodies are **not** domain events unless an audit policy opts in.
- Clock reads during replay must not inject wall-clock nondeterminism.

## Default engine

SQLite partition via `@hobo/storage-sqlite` + `@hobo/runtime-local` (see [EventStore](/HoBo/reference/eventstore/)).

## Testing

[Durable EventStore](/HoBo/testing/durability/) · [Unit tests](/HoBo/testing/unit/)
