---
type: Competitive Reference
title: "Comprehensive Platform Orchestrators — category index"
description: "Category index: Systems that own application and platform orchestration end to end: environment management, resource abstraction, governance, and developer self-service in one control plane."
tags: [hobo, competitors, category]
---

# Comprehensive Platform Orchestrators

> Category index. Full research lives in each canonical capture — see [`../metadata-contract.md`](../metadata-contract.md) for why this page carries rows, not research.

## Category boundary

Systems that own application and platform orchestration end to end: environment management, resource abstraction, governance, and developer self-service in one control plane.

## Why HoBo competes here

This is HoBo's home category. HoBo is a control plane that turns application intent into scored, provider-matched deployments, so anything claiming to orchestrate applications across environments contests HoBo directly.

## Competitors (8)

| Competitor | Role in this category | Directness | Contested HoBo surface | Competitor advantage | HoBo distinction | Posture | Priority |
| ---------- | --------------------- | ---------- | ---------------------- | -------------------- | ---------------- | ------- | -------- |
| [**Humanitec**](../humanitec.md) *(primary)* | Platform Orchestrator for IDPs with dynamic configuration management — head-on orchestrator competitor | direct | `app-graph`, `environments`, `provider-matching`, `governance` | Proven enterprise Platform Orchestrator with mature dynamic configuration. | HoBo is developer-first and self-hostable, with an event-sourced audit trail instead of a SaaS-only control plane. | displace, benchmark | P1 |
| [**Crossplane**](../crossplane.md) | CNCF Kubernetes control plane for infrastructure — borrow-source and pluggable IaC adapter | overlapping | `typed-contracts`, `provider-matching`, `reconciliation`, `extensibility` | Battle-tested Kubernetes-native composition with a huge provider catalog. | HoBo does not require Kubernetes to exist: the control plane runs local, browser, or hosted on a portable SQLite EventStore. | borrow, integrate | P1 |
| [**Nomad**](../nomad.md) | workload scheduler/orchestrator plus jobspec packaging — direct scheduler/control-plane competitor and provider target | overlapping | `provider-matching`, `runtime-portability`, `reconciliation` | Simple, proven scheduler that runs non-container workloads well. | HoBo schedules across providers rather than across a cluster, and carries application intent above the jobspec. | borrow, provider-target, benchmark | P1 |
| [**Qovery**](../qovery.md) | BYOC internal developer platform deploying into your own cloud — PaaS/IDP competitor | direct | `environments`, `delivery`, `provider-matching` | Mature BYOC deployment into a customer's own cloud accounts. | HoBo's BYOC story is Bindle-first with PortabilityReport scoring rather than a fixed engine per cloud. | displace, benchmark | P2 |
| [**Radius**](../radius.md) | CNCF cloud-native application platform (app graph, Recipes, connections) — borrow-source for recipes and app model | overlapping | `app-graph`, `typed-contracts`, `environments` | Well-designed application graph with Recipes and typed connections. | HoBo's app graph is event-sourced and provider-scored, and does not presume Kubernetes hosting. | borrow | P1 |
| [**Mia-Platform**](../mia-platform.md) *(primary)* | enterprise platform orchestrator plus developer portal — owns the same application-to-environment span HoBo does, in one commercial suite | direct | `app-graph`, `environments`, `governance`, `agent-surface`, `extensibility`, `delivery` | Shipped enterprise suite: catalog-as-digital-twin, Scorecards/Campaigns governance, an MCP server over platform state, plus data pipelines and UI composition. | HoBo describes applications against abstract ports and scores portability; a Mia Project is configured against the infrastructure it will run on, and assumes Kubernetes. | displace, benchmark, borrow | P1 |
| [**Harness Platform**](../harness.md) *(primary)* | modular commercial DevOps platform whose CD, IDP, IaCM and cost modules each contest a different HoBo surface | overlapping | `delivery`, `governance`, `environments`, `finops`, `extensibility`, `observability` | Nine shipped modules on one governed platform: mature CD/GitOps with approvals and Continuous Verification, OPA policy, audit, and an outbound-only Delegate that needs no ingress. | Harness automates delivery to infrastructure you already chose; HoBo owns the layer above — a provider-abstract application description resolved by a scored, recorded decision. | benchmark, borrow, integrate | P1 |
| [**Facets.cloud**](../facets.md) *(primary)* | declarative environment orchestrator — the closest commercial product to HoBo's intent-to-provider thesis, realized through generated Terraform/Helm | direct | `app-graph`, `environments`, `provider-matching`, `governance`, `extensibility` | Ships the same declare-intent thesis against real clouds today, generating Terraform/Helm from platform-authored modules across AWS, GCP, Azure and Kubernetes. | Facets resolves intent through a hand-written module; HoBo resolves it by scored matching recorded as an event, with a PortabilityReport that says how well the move actually holds. | displace, benchmark, borrow | P1 |

## Navigation

- [All categories](index.md) · [corpus index](../index.md) · [cross-category matrix](../matrix.md) · [gap analysis](../gap-analysis.md)
