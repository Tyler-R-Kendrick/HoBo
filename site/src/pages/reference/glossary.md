---
layout: ../../layouts/Docs.astro
title: Glossary
description: "Short definitions for Bindle, Camp, Yard, Junction, EffectSpec, EventStore, Crew, Gatekeeper, and related HoBo terms."
---

# Glossary

| Term | Definition |
|---|---|
| **Bindle** | Provider-agnostic packed app: services, resources, wiring, policy intent |
| **Camp** | Current home: one provider + durable runtime substrate |
| **Yard** | Provider control-plane scope over camps (policy, identity, reconciliation) |
| **Junction** | Cross-yard federation; peer yards, no shared mutable state |
| **Conductor / Broker** | Policy-governed placement authority (`@hobo/broker`) |
| **Gatekeeper** | Composite deploy gate: contracts + policy + obligations + cost (+ more) |
| **Contract IR** | Versioned `BoundaryContract` between producer and consumer edges |
| **EffectSpec** | Optional side-effect annotation (purity + domains) on a contract |
| **EffectManifest** | Exportable summary of a contract’s effects |
| **ResilienceProfile** | Secondary resiliency metadata (retry/timeout/…); not a top-level primitive |
| **EventStore** | Append-only log port for domain/control facts |
| **DurableEventStore** | EventStore + positions, commit-with-effects, durable checkpoints |
| **EventPosition** | Partition-local monotonic store position (`bigint`) |
| **SQLite partition** | One DB file, one active writer; scale by partitions |
| **ActorHost** | Single-writer lease + fencing token for aggregates |
| **Crew** | Built-in operator agents in the Yard (SRE, GitOps, …) |
| **PACT** | Consumer-driven interaction tests under Contract IR |
| **Bridge** | Session-scoped local/remote boundary routing modes |

Longer design glossary lives in the design suite; this page is the site-facing subset.
