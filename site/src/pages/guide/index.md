---
layout: ../../layouts/Docs.astro
title: What is HoBo?
description: "HoBo is an AI-native meta-cloud with one guiding principle: every app deserves a home, and continuous migration keeps finding it a cheaper one."
---

# What is HoBo?

HoBo is an **AI-native meta-cloud** built on one guiding principle: **every app deserves a home — preferably a cheap one.** You describe your app once, HoBo places it on real infrastructure that passes your policies, and then — this is the part nobody else does — **it keeps looking**. When a better-value home opens up, continuous migration moves your app there, without a rewrite, a war room, or a weekend.

> **Honest status:** HoBo is **pre-release**. The surfaces documented on this site — the SDK primitives, the `hobo` CLI, the MCP surface — are the contract the product is being built to, and they're stable enough to learn today. See [the trail map](/HoBo/guide/status/) for where the build is.

## The pitch

*"Write your app once. HoBo finds it the cheapest home that meets your standards — and moves it when somewhere better opens up. Built for humans and the agents that work for them."*

A developer (or an agent) packs the app into a [**Bindle**](/HoBo/primitives/bindles/), runs `hobo up`, and the app lands in a [**Camp**](/HoBo/primitives/camps/) — chosen by you, or by the Dispatcher optimizing over price, policy, and reliability. From then on, placement is a *standing decision*, not a historical one.

## Why "HoBo"?

The name is the philosophy. A hobo travels light, works where the work is, and moves on when a town stops being worth the rent. HoBo apps live the same way:

- **Travel light.** Everything the app owns fits in its bindle — no provider-shaped roots that make leaving expensive.
- **Work anywhere.** Ports and adapters mean any provider that passes conformance is a valid home.
- **Move when it's worth it.** Continuous migration re-plans placement for as long as the app lives. Rent goes down, not up.

## Why it exists

Modern app teams pick between two bad landlords:

1. **The company town (closed PaaS)** — easy deploys, but the rent only goes up and the exits are decorative.
2. **The fixer-upper (raw cloud + IaC)** — full control, and a second full-time job maintaining it.

HoBo is the third option: **cloud portability without hiding the cloud.**

- Start with provider-agnostic application intent.
- Let HoBo choose (and keep re-choosing) infrastructure from policy, cost, compliance, and reliability goals.
- Drop down to typed provider-specific options (`.with(...)`) when optimization matters.
- Keep humans and AI agents on the same authenticated, auditable control surface.

## What makes it different

| Property | What it means |
|---|---|
| **Continuous migration** | Placement is re-decided for as long as your app lives. Price drops, credits, and reliability signals trigger policy-gated moves — the same convergence loop as a deploy, so a move is never a special event. |
| **WIT/WASM programmable surface** | Ports are [WIT](https://component-model.bytecodealliance.org/) interfaces; apps are wasm components (OCI fallback); providers are capability providers. The thin, typed membrane is exactly what makes moving cheap. |
| **Event-sourced everything** | Deployments, migrations, workflows, even token issuance are events in an append-only log — replay, audit, and rollback come free. |
| **Agents as first-class users** | Every capability is reachable via SDK, CLI, **and** MCP. Agents get scoped short-lived credentials, plus a built-in operator roster (the Crew). |
| **Self-host = hosted** | The Yard (control plane) is itself a Bindle. The only difference is who runs it. |

## Who HoBo is (and isn't) for

**For:** teams that want their hosting bill to trend down; teams that want provider-agnostic apps with real escape hatches; platform teams that want governable, auditable delivery; agent-driven development and operations.

**Not for** (by design):

- Teams happily settled on a single cloud with deep native tooling — if you never want to move, you don't need a mover.
- Pure-Kubernetes shops already invested in Crossplane/KubeVela (HoBo can sit on top, but it isn't k8s-first).
- Apps needing bare-metal control where any abstraction is a liability.

## Where to go next

- [Getting started](/HoBo/guide/getting-started/) — pack a bindle, pitch a camp, `hobo up`.
- [Core concepts](/HoBo/guide/concepts/) — the vocabulary: Bindle, Camp, Yard, Junction, and friends.
- [Architecture](/HoBo/guide/architecture/) — how the describing, placing, and moving actually works.
- [Agent docs](/HoBo/agents/) — how AI agents authenticate to and operate HoBo.
