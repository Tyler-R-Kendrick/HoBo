---
layout: ../../layouts/Docs.astro
title: Glossary
description: "Site-facing definitions for HoBo primitives, ports, contracts, effects, Crew, identity, and delivery terms."
---

# Glossary

| Term | Definition |
|---|---|
| **Bindle** | Provider-agnostic packed app: services, resources, wiring, policy intent |
| **Camp** | Current home: one provider + durable runtime substrate |
| **Yard** | Provider control-plane scope over camps (policy, identity, reconciliation) |
| **Junction** | Cross-yard federation; peer yards, no shared mutable state |
| **Conductor / Broker** | Policy-governed placement authority (`@hobo/broker`) |
| **Station** | Hard control-plane isolation boundary a Conductor occupies (ADR-0131) |
| **Rail** | Content-addressed Station profile/bootstrap pin |
| **Trail** | App-owned continuous migration recipe (ADR-0134) |
| **OpenFeature** | CNCF flag evaluation API; sole public app flag surface under Harness |
| **Matching** | Resource definition + placement selection process |
| **ResourceActor** | Single-writer reconcilers for infrastructure resources |
| **Gatekeeper** | Composite deploy gate: contracts + policy + obligations + cost (+ more) |
| **Contract IR** | Versioned `BoundaryContract` between producer and consumer edges |
| **EffectSpec** | Optional side-effect annotation (purity + domains) on a contract |
| **EffectManifest** | Exportable summary of a contract’s effects |
| **ResilienceProfile** | Secondary resiliency metadata (retry/timeout/…); not a primary noun |
| **EventStore** | Append-only log port for domain/control facts |
| **DurableEventStore** | EventStore + positions, commit-with-effects, durable checkpoints |
| **EventPosition** | Partition-local monotonic store position (`bigint`) |
| **SQLite partition** | One DB file, one active writer; scale by partitions |
| **ActorHost** | Single-writer lease + fencing token for aggregates |
| **fenceToken** | Monotonic lease epoch (`bigint`) paired with stream `owner_epoch` |
| **Streamer** | High-volume frame journal outside the domain event log |
| **Queue** | Deferred work port with leases and idempotency |
| **Clock** | Deterministic time port for workflows and tests |
| **Crew** | Built-in operator agents in the Yard |
| **A2H** | Agent-to-human handoff with obligation deadlines |
| **Runbook** | Trigger → diagnose → gated fix, event-sourced |
| **PACT** | Consumer-driven interaction tests under Contract IR |
| **Bridge** | Session-scoped local/remote boundary routing modes |
| **Harness** | Flags / progressive delivery / experiments plane |
| **Lane** | Sandbox isolation for experimental traffic/contracts |
| **Golden suite** | Signed multi-check deploy gate bundle |
| **SVID** | Workload/agent SPIFFE-style identity document |
| **Relay** | Outbound network proxy keeping cloud creds in-boundary — *not* an agent |
| **Named endpoint** | Hierarchical DNS-valid host under `.hobo.localhost` / `.hobo.test` (ADR-0130; never bare `.hobo`) |
| **Resource intent** | Provider-neutral desired resource used in planning/FinOps routing |
| **Showback** | Usage attribution projection — not an invoice by itself |
| **Secretless-first** | Prefer federation/bindings over stored secrets |
| **can-deploy** | Compatibility matrix diagnostic for producer/consumer skew |
| **can-trail** | Gate dimension for Trail readiness |
| **WIT** | Wasm Interface Types — component capability membrane |

Longer design glossary lives in the repo design suite; this page is the **site-facing** subset for humans and agents reading Pages.
