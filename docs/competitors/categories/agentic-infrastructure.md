---
type: Competitive Reference
title: "Agentic Infrastructure & Operations — category index"
description: "Category index: AI-native infrastructure modeling, autonomous remediation, agent tool surfaces, operational world models, and agent-governed platform control."
tags: [hobo, competitors, category]
---

# Agentic Infrastructure & Operations

> Category index. Full research lives in each canonical capture — see [`../metadata-contract.md`](../metadata-contract.md) for why this page carries rows, not research.

## Category boundary

AI-native infrastructure modeling, autonomous remediation, agent tool surfaces, operational world models, and agent-governed platform control.

## Why HoBo competes here

HoBo is AI-native by design. This category tests whether HoBo's policy-gated, audited agent surface beats products already shipping autonomous operations.

## Competitors (5)

| Competitor | Role in this category | Directness | Contested HoBo surface | Competitor advantage | HoBo distinction | Posture | Priority |
| ---------- | --------------------- | ---------- | ---------------------- | -------------------- | ---------------- | ------- | -------- |
| [**Antimetal**](../antimetal.md) *(primary)* | AI-native production-operations layer (world model, RCA, agent handoff) — SRE/operator benchmark | adjacent | `observability`, `agent-surface`, `finops` | Shipped autonomous RCA and remediation with a production world model. | HoBo's agent surface is contract- and policy-gated at the boundary, with audited decisions rather than opaque fixes. | benchmark, integrate | P1 |
| [**InsForge**](../insforge.md) | agent-native backend-as-a-service — agent-ops benchmark and possible provider target | adjacent | `agent-surface`, `typed-contracts` | Agent-native BaaS with a coherent MCP-shaped surface already shipped. | HoBo exposes agent surfaces through policy-gated contracts across any provider, not one hosted backend. | benchmark, provider-target | P2 |
| [**Lakebed**](../lakebed.md) | agent-native closed PaaS (Capsules, sync RPC, llms.txt) — named head-on competitor | direct | `agent-surface`, `authoring`, `delivery` | Purpose-built agent PaaS with a tight, opinionated capsule model. | HoBo is open, provider-agnostic, and does not require its own hosted runtime to be useful. | displace | P1 |
| [**Vercel**](../vercel.md) | frontend cloud plus durable Workflow SDK and AI stack — borrow-source promoted to full parity capture | overlapping | `delivery`, `environments`, `agent-surface` | Exceptional delivery pipeline plus a durable workflow and AI stack. | HoBo's durable execution is event-sourced and portable, not tied to one hosting vendor. | benchmark, borrow, provider-target | P1 |
| [**Harness Platform**](../harness.md) | modular commercial DevOps platform whose CD, IDP, IaCM and cost modules each contest a different HoBo surface | overlapping | `delivery`, `governance`, `environments`, `finops`, `extensibility`, `observability` | AIDA agent features span pipeline generation and failure triage across nine shipped modules. | HoBo gates agent actions through boundary contracts and records each decision as an event, rather than surfacing assistance inside a pipeline UI. | benchmark, borrow, integrate | P2 |

## Navigation

- [All categories](index.md) · [corpus index](../index.md) · [cross-category matrix](../matrix.md) · [gap analysis](../gap-analysis.md)
