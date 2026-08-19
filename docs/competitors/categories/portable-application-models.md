---
type: Competitive Reference
title: "Portable Application Models & Control Planes — category index"
description: "Category index: Application-intent models, programmable resource/capability abstractions, composition engines, placement, reconciliation, and portable control-plane APIs."
tags: [hobo, competitors, category]
---

# Portable Application Models & Control Planes

> Category index. Full research lives in each canonical capture — see [`../metadata-contract.md`](../metadata-contract.md) for why this page carries rows, not research.

## Category boundary

Application-intent models, programmable resource/capability abstractions, composition engines, placement, reconciliation, and portable control-plane APIs.

## Why HoBo competes here

HoBo's Bindle kinds, BoundaryContracts and PortabilityReport are exactly an application model plus a portability claim. Every alternative model competes for the same authoring mindshare.

## Competitors (10)

| Competitor | Role in this category | Directness | Contested HoBo surface | Competitor advantage | HoBo distinction | Posture | Priority |
| ---------- | --------------------- | ---------- | ---------------------- | -------------------- | ---------------- | ------- | -------- |
| [**Crossplane**](../crossplane.md) *(primary)* | CNCF Kubernetes control plane for infrastructure — borrow-source and pluggable IaC adapter | overlapping | `typed-contracts`, `provider-matching`, `reconciliation`, `extensibility` | Battle-tested Kubernetes-native composition with a huge provider catalog. | HoBo does not require Kubernetes to exist: the control plane runs local, browser, or hosted on a portable SQLite EventStore. | borrow, integrate | P1 |
| [**Radius**](../radius.md) *(primary)* | CNCF cloud-native application platform (app graph, Recipes, connections) — borrow-source for recipes and app model | overlapping | `app-graph`, `typed-contracts`, `environments` | Well-designed application graph with Recipes and typed connections. | HoBo's app graph is event-sourced and provider-scored, and does not presume Kubernetes hosting. | borrow | P1 |
| [**.NET Aspire**](../aspire.md) | code-first app composition, local orchestration and deploy — closest authoring analog outside TypeScript | direct | `authoring`, `app-graph`, `wiring`, `environments` | Mature code-first composition with first-class local orchestration and a large .NET ecosystem. | HoBo is language-neutral, provider-abstract via Bindle kinds, and carries residency/portability scoring Aspire has no notion of. | borrow, benchmark | P1 |
| [**Alchemy**](../alchemy.md) | TypeScript-native engine-less IaC — competes on the authoring/provisioning core and is a candidate iac-alchemy adapter | direct | `authoring`, `typed-contracts`, `reconciliation`, `extensibility` | Engine-less TS provisioning with no state daemon; very fast provider authoring. | HoBo keeps a durable event-sourced state authority with replay and PortabilityReport scoring rather than ad-hoc reconcile. | borrow, benchmark | P1 |
| [**Dapr**](../dapr.md) | distributed-application runtime with portable building-block APIs — closest architectural analog to Bindle kinds | overlapping | `typed-contracts`, `runtime-portability`, `wiring`, `identity-secrets` | Standardized building-block APIs with a wide, production-proven component catalog. | HoBo's Bindle kinds carry residency, effects and portability scoring at the contract boundary, not just a sidecar API. | borrow, standard, integrate | P1 |
| [**Humanitec**](../humanitec.md) | Platform Orchestrator for IDPs with dynamic configuration management — head-on orchestrator competitor | direct | `app-graph`, `environments`, `provider-matching`, `governance` | Proven enterprise Platform Orchestrator with mature dynamic configuration. | HoBo is developer-first and self-hostable, with an event-sourced audit trail instead of a SaaS-only control plane. | displace, benchmark | P1 |
| [**Nitric**](../nitric.md) | cloud-agnostic infrastructure-from-code framework — authoring analog for typed resource declaration | overlapping | `authoring`, `typed-contracts`, `provider-matching`, `runtime-portability` | Clean IfC authoring with automatic least-privilege IAM inference. | HoBo separates intent from provider selection and scores impedance instead of assuming clean portability. | borrow, benchmark | P2 |
| [**SST**](../sst.md) | infrastructure-from-code full-stack framework on Pulumi/Terraform with typed Linking — close product analog | direct | `authoring`, `typed-contracts`, `wiring`, `environments` | Huge provider reach via Pulumi/Terraform plus excellent live local dev. | HoBo's portability is scored, and its state authority is an event log rather than a stack state file. | displace, borrow, benchmark | P1 |
| [**Facets.cloud**](../facets.md) | declarative environment orchestrator — the closest commercial product to HoBo's intent-to-provider thesis, realized through generated Terraform/Helm | direct | `app-graph`, `environments`, `provider-matching`, `governance`, `extensibility` | Ships the same declare-intent thesis against real clouds today, generating Terraform/Helm from platform-authored modules across AWS, GCP, Azure and Kubernetes. | Facets resolves intent through a hand-written module; HoBo resolves it by scored matching recorded as an event, with a PortabilityReport that says how well the move actually holds. | displace, benchmark, borrow | P1 |
| [**Massdriver**](../massdriver.md) | bundle-and-artifact platform whose JSON-Schema connection contracts are the closest shipped analog to HoBo's typed capability wiring | direct | `typed-contracts`, `wiring`, `app-graph`, `environments`, `extensibility`, `governance` | Typed connections ship today over the whole OpenTofu/Terraform ecosystem, with a visual canvas that refuses incompatible wiring and an on-ramp from existing modules. | Massdriver types the resource boundary; HoBo types the capability boundary, chooses the realization by scored decision, and reports how well the swap actually holds. | displace, borrow, benchmark | P1 |

## Navigation

- [All categories](index.md) · [corpus index](../index.md) · [cross-category matrix](../matrix.md) · [gap analysis](../gap-analysis.md)
