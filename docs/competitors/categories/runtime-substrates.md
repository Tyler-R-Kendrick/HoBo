---
type: Competitive Reference
title: "Runtime & Distributed Application Substrates — category index"
description: "Category index: Runtimes, schedulers, component hosts, actor systems, service building blocks, and fleet substrates."
tags: [hobo, competitors, category]
---

# Runtime & Distributed Application Substrates

> Category index. Full research lives in each canonical capture — see [`../metadata-contract.md`](../metadata-contract.md) for why this page carries rows, not research.

## Category boundary

Runtimes, schedulers, component hosts, actor systems, service building blocks, and fleet substrates.

## Why HoBo competes here

Some of these HoBo adopts (wasmCloud), some it targets, and some genuinely compete for the runtime layer. The distinction matters: adopting a substrate is not losing a category.

## Competitors (10)

| Competitor | Role in this category | Directness | Contested HoBo surface | Competitor advantage | HoBo distinction | Posture | Priority |
| ---------- | --------------------- | ---------- | ---------------------- | -------------------- | ---------------- | ------- | -------- |
| [**celld**](../celld.md) *(primary)* | self-hosted Cloudflare Workers/Durable Objects daemon — experimental DO dialect and candidate ActorHost | adjacent | `runtime-portability`, `reconciliation` | Self-hostable Durable Objects dialect with per-cell SQLite and S3 CAS. | HoBo's actor/EventStore ports are provider-neutral, so celld is one resolver among several rather than the model. | adopt, provider-target | P3 |
| [**Dapr**](../dapr.md) *(primary)* | distributed-application runtime with portable building-block APIs — closest architectural analog to Bindle kinds | overlapping | `typed-contracts`, `runtime-portability`, `wiring`, `identity-secrets` | Standardized building-block APIs with a wide, production-proven component catalog. | HoBo's Bindle kinds carry residency, effects and portability scoring at the contract boundary, not just a sidecar API. | borrow, standard, integrate | P1 |
| [**Nomad**](../nomad.md) *(primary)* | workload scheduler/orchestrator plus jobspec packaging — direct scheduler/control-plane competitor and provider target | overlapping | `provider-matching`, `runtime-portability`, `reconciliation` | Simple, proven scheduler that runs non-container workloads well. | HoBo schedules across providers rather than across a cluster, and carries application intent above the jobspec. | borrow, provider-target, benchmark | P1 |
| [**Rivet**](../rivet.md) *(primary)* | open-source Durable Objects / actor runtime — preferred compatible ActorHost resolver | adjacent | `runtime-portability`, `replay-migration` | Open-source actor runtime with per-actor SQLite and a credible DO-compatible API. | HoBo's ActorHost port keeps actors portable across Rivet, celld or local runtimes. | adopt, provider-target | P2 |
| [**Spin / Fermyon**](../spin-fermyon.md) *(primary)* | wasm serverless framework and hosts — SpinKube is a HoBo component-host adapter | adjacent | `runtime-portability`, `extensibility` | Fast wasm serverless with a mature Kubernetes operator (SpinKube). | HoBo targets wasm hosts as component-host adapters rather than being one. | adopt, render-target | P2 |
| [**Wasm host landscape**](../wasm-hosts.md) *(primary)* | cohort capture of the wasm component-hosting landscape grounding ADR-0031 component-host adapters | adjacent | `runtime-portability`, `extensibility` | Real, shipped component-hosting implementations across several runtimes. | HoBo abstracts them behind component-host adapters with impedance limits recorded. | adopt, render-target | P2 |
| [**wasmCloud**](../wasmcloud.md) *(primary)* | CNCF wasm component runtime (lattice, wRPC, capability providers) — adopted substrate, HoBo's default host | adjacent | `runtime-portability`, `extensibility`, `typed-contracts` | Mature CNCF component runtime with lattice distribution and wRPC. | Adopted as HoBo's default host — the contest is over the layer above, not the runtime. | adopt, standard | P1 |
| [**.NET Aspire**](../aspire.md) | code-first app composition, local orchestration and deploy — closest authoring analog outside TypeScript | direct | `authoring`, `app-graph`, `wiring`, `environments` | Mature code-first composition with first-class local orchestration and a large .NET ecosystem. | HoBo is language-neutral, provider-abstract via Bindle kinds, and carries residency/portability scoring Aspire has no notion of. | borrow, benchmark | P1 |
| [**Flux Network**](../flux-network.md) | decentralized container host with a Git-to-Flux deploy UX (Orbit) — compute provider target, not an actor runtime | adjacent | `provider-matching`, `runtime-portability` | Decentralized capacity with genuinely independent operators. | HoBo treats it as a scored provider target subject to the same residency and impedance rules as any hyperscaler. | provider-target | P3 |
| [**Modal**](../modal.md) | Python-first serverless compute for AI/ML with agent Sandboxes — AI-native compute competitor | adjacent | `runtime-portability`, `provider-matching` | Best-in-class serverless GPU cold-start and Python ergonomics. | HoBo treats GPU compute as a Bindle kind with provider matching rather than a single vendor runtime. | provider-target, benchmark | P3 |

## Navigation

- [All categories](index.md) · [corpus index](../index.md) · [cross-category matrix](../matrix.md) · [gap analysis](../gap-analysis.md)
