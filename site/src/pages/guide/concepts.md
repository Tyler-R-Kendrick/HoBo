---
layout: ../../layouts/Docs.astro
title: Core concepts
description: "The HoBo vocabulary: Bindle, Camp, Yard, Junction, the WIT/WASM membrane, the replayable event log, and agent-native identity."
---

# Core concepts

HoBo's metaphor is the itinerant worker who travels light. The names are thematic; the technical meaning is what matters. The canonical term source is the [glossary](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/glossary.md), enforced by the `docs:design-lint` gate.

## The four scopes

Scopes nest by breadth: **`Bindle ⊂ Camp ⊂ Yard ⊂ Junction`**.

| Scope | What it is |
|---|---|
| **Bindle** | The application package/topology: services, resources, wiring, policies, and deployment intent. Provider-agnostic by construction. |
| **Camp** | A **provider-specific** runtime target (≈ a stack in one region/group) that hosts workloads and **provides the durable runtime**: event store, queues, streams, actor host, clock. |
| **Yard** | A **provider-specific** control scope spanning that provider's Camps: cross-Camp policy, identity, reconciliation, and provider-global networking. One Yard per provider. |
| **Junction** | The cross-Yard **federation** layer for hybrid/multi-cloud. Peer Yards, no shared mutable state — the final edge is federation, not containment. |

Multi-region within a provider = several Camps under one Yard. Multi-cloud = several Yards federated into a Junction.

## The WIT/WASM membrane

The portable contract between app code, runtime ports, and provider adapters is **WIT** (the WebAssembly Component Model's interface language, hosted on wasmCloud by default):

- **Ports are WIT interfaces** — `api`, `kv`, `bucket`, `queue`, `topic`, `secret`, `sql`, schedules, websockets, jobs, and more.
- **Apps are wasm components** (with an OCI-container fallback for anything wasm can't host yet).
- **Providers are capability providers** linked to component imports — deny-by-default: a component reaches a backend only via a link the manifest declared.
- **Any Component-Model language** can author against the same interfaces. TypeScript is the first reference implementation, not a requirement.

## Ports and adapters, everywhere

Cloud providers, IaC engines (Pulumi, Crossplane, Terraform/OpenTofu), build/VM tools (Dagger, Packer, Firecracker), identity systems, and AI optimizers all sit behind replaceable ports. Two consequences:

- **Conformance is the contract.** Every port ships a contract test suite; any adapter — human- or AI-written — must pass it to be certified.
- **Patchable, not just portable.** You can swap any engine, add any adapter, fork the Yard, and persist AI/human patches, with conformance as the trust bridge.

## The replayable event log

Control-plane state, projections, SRE workflows, and audit trails all derive from an **append-only event log**. Commands mutate state only by appending events (CQRS/event sourcing), which buys:

- **Recovery:** a crash anywhere is recovered by replaying the stream.
- **Audit:** every state transition — including *agent token issuance* — is a durable, attributable fact.
- **Time travel:** projections can be rebuilt at any point in history.

## Agent-native identity

AI agents are **first-class principals**, not scripts holding a human's API key:

- Workload identity (SVID/OIDC) with **brokered short-lived tokens** — secretless-first, no static credentials.
- A machine-readable **capability standard** so agents can self-provision exactly the credentials a task needs.
- Policy checks at every phase, and traceable actions in the same event log as everything else.
- An MCP control surface alongside the SDK and CLI, so the same capabilities are reachable by humans and agents alike.

## Where the details live

- [Vision & principles](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/vision.md) — the eleven design north stars.
- [WASM/WASI runtime & WIT reference](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/wasm-runtime-wit.md)
- [Authoring: resources, wiring, `.allow()`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/authoring-resources-wiring.md)
- [AI-native platform & agent auth](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/ai-native-agent-auth.md)
- [Event model & data plane](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/data-plane.md)
