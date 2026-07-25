---
layout: ../../layouts/Docs.astro
title: What is HoBo?
description: "HoBo is an AI-native meta-cloud under active design: one app description mapped onto any mix of real providers, operable by humans and agents alike."
---

# What is HoBo?

HoBo is an **AI-native meta-cloud**: a cloud-agnostic control plane and durable runtime that maps a single app description onto any mix of real infrastructure — one provider, several, or your own metal — without rewriting app code.

> **Honest status:** HoBo is a **design-first project**. The product is not shipped. What exists today is an active, executable design: 60+ capability docs, 120+ ADRs, proof/contract packages that pin behavior, and a production package scaffold — all enforced by CI gates. See [Project status](/HoBo/guide/status/).

## The pitch

*"Write your app once. HoBo — the AI-native meta-cloud — decides how to host it, and gets out of the way when you want control. Built for humans and the agents that work for them."*

A developer (or an agent) should be able to describe an app once as a [**Bindle**](/HoBo/guide/concepts/), then `hobo up` and have it land on real infrastructure — **agnostic by default, optimizable on demand**.

## Why it exists

Modern app teams still choose between two bad defaults:

1. **Closed PaaS** — easy deploys, but lock-in, a single runtime, and limited escape hatches.
2. **Raw cloud + IaC** — full control, but every app team becomes a part-time platform team.

HoBo's goal is a third path: **cloud portability without hiding the cloud**.

- Start with provider-agnostic application intent.
- Let HoBo choose or reconcile infrastructure from policy, cost, compliance, and reliability goals.
- Drop down to typed provider-specific options (`.with(...)`) when optimization matters.
- Keep humans and AI agents on the same authenticated, auditable control surface.

## What makes it different

| Property | What it means |
|---|---|
| **WIT/WASM programmable surface** | Ports are [WIT](https://component-model.bytecodealliance.org/) interfaces; apps are wasm components (OCI fallback); providers are capability providers. Any Component-Model language authors against the same contracts — TypeScript is the first reference implementation, not a requirement. |
| **Event-sourced everything** | Deployments, workflows, actor state, even token issuance are events in an append-only log — replay, audit, and time travel come for free. |
| **Agents as first-class users** | Every capability is reachable via SDK, CLI, **and** MCP. Agents get scoped short-lived credentials via a machine-readable capability standard, plus a built-in operator roster (the Crew). |
| **Ports over platforms** | Cloud providers, IaC engines (Pulumi, Crossplane, OpenTofu), build tools, and identity systems all sit behind replaceable, conformance-tested ports — new backends are adapters, ideally AI-generated. |
| **Self-host = hosted** | The Yard (control plane) is itself a Bindle. The only difference is who runs it. |

## Who HoBo is (and isn't) for

**For:** teams that want provider-agnostic apps with real escape hatches; platform teams that want governable, auditable delivery; agent-driven development and operations.

**Not for** (by design — see the [vision doc](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/vision.md)):

- Teams happy on a single cloud with deep native tooling (SST or a native CDK is simpler).
- Pure-Kubernetes shops already invested in Crossplane/KubeVela (HoBo can sit on top, but it isn't k8s-first).
- Apps needing bare-metal control where any abstraction is a liability.

## Where to go next

- [Getting started](/HoBo/guide/getting-started/) — clone the repo and run the gates.
- [Core concepts](/HoBo/guide/concepts/) — Bindle, Camp, Yard, Junction, and friends.
- [Architecture](/HoBo/guide/architecture/) — control plane, data plane, and the package map.
- [Agent docs](/HoBo/agents/) — how AI agents use, run, and extend this repo.
- The canonical deep dive: the [design suite index](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/index.md) on GitHub.
