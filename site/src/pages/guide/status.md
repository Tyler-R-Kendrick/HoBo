---
layout: ../../layouts/Docs.astro
title: The trail map
description: "Where HoBo actually is on the road: pre-release, what runs today, and the staged journey from local fidelity to multi-cloud."
---

# The trail map

Where is HoBo on the road? Here's the honest itinerary.

| Area | State |
|---|---|
| **Product** | Pre-release. Not yet accepting paying tenants — or freeloading ones. |
| **Developer surface** | The SDK primitives, `hobo` CLI verbs, and MCP surface on this site are **contract-pinned**: specified, validated, and stable to learn against. |
| **Implementation** | Progressing through staged build gates (below). See “What runs today” for the shipped slice. |
| **This site** | The canonical public developer documentation — for humans and agents. |

## What runs today

- **The TypeScript Bindle flow.** A project with `src/bindle.ts` runs `hobo collect`, `hobo plan`, `hobo up`, `hobo down`, and `hobo dev` end to end against the default **local lane** — no cloud account. `hobo dev` serves your api/web handlers in-process; a committed `hobo.bindle.json` wins when present.
- **Durable local EventStore.** Camps default to a **single-owner SQLite** journal: stream-head concurrency control, actor fencing, positioned catch-up, durable checkpoints, and atomic events with staged queue/timer/outbox work. Browser hosts use SQLite WASM with OPFS when available (fail-closed if durable storage is required but unavailable).
- **Contract effects + resiliency.** Boundary contracts may declare side-effect intent and resiliency profiles; can-deploy treats unsafe effect widening as breaking; Gatekeeper surfaces summaries; pure contracts isolate without infra.
- **Stations & Conductor.** Control-plane isolation, Rails, and placement receipts pinned to station and rail.
- **Trails + continuous identity.** Migration recipes when you need them; pure identity continuous needs no Trail authoring.
- **Progressive delivery.** Flag evaluation, experiments, and delivery composition under policy.
- **Connectivity.** Hierarchical naming (never bare `.hobo`), overlay/DNS, secretless connectors, environment isolation.
- **Component hosts.** Wasmtime, OCI/Kubernetes, and multi-cloud host options behind the same Camp ports.
- **Messaging.** Unified `topic()` / messaging plane with Kafka and optional Dapr adapters; default remains the local in-process path.
- **Session Replay on every App Kit.** Privacy-first capture; local dual fixtures default-on; production flag/sample gated; `hobo replay *`.
- **MCP control surface.** All **38** canonical CLI verbs as MCP tools over stdio (1:1 parity), deny-by-default auth, audited decisions.
- **Credential-gated live lanes.** Cloudflare, Vercel, and live IaC unlock with your own provider credentials.
- **Topology authoring.** `camp()` (env shape), `yard({ provider, camps })` (provider selection), `junction()` plan derivation — realization depth varies by stage.
- **Not yet shipped:** full multi-cloud provider depth, Junction realization maturity, and alternate journal engines (Postgres, Temporal, Restate, …).

## How the build is staged

One leg at a time:

- **Local toolchain** — hello Bindle through CI with guards green. 
- **Local fidelity** — offline `hobo dev`, replay equals live. 
- **First cloud + Yard** — first provider and drift policy. 
- **Agent autonomy** — scoped agent auth and operator hooks. 
- **Multi-cloud** — overlays, placement across providers, Junctions. 
- **Extensibility** — provider generation and forge hooks. 
- **Production hardening** — HA/DR, canary, FinOps. 

## What “contract-pinned” means

Public surfaces — SDK signatures, CLI verbs, event families — are pinned by executable contracts and conformance suites. Documented examples track the canonical CLI. When this site changes, it is because the **product contract** changed, not because marketing drifted.

## Following along

- [Getting started](/HoBo/guide/getting-started/) 
- [Core concepts](/HoBo/guide/concepts/) 
- [Agent docs](/HoBo/agents/) and [`llms.txt`](/HoBo/llms.txt) 
