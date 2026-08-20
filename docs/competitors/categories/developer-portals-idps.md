---
type: Competitive Reference
title: "Developer Portals & IDPs — category index"
description: "Category index: Developer-facing catalogs, scaffolding, self-service workflows, scorecards, and platform interfaces that can front or partially substitute HoBo."
tags: [hobo, competitors, category]
---

# Developer Portals & IDPs

> Category index. Full research lives in each canonical capture — see [`../metadata-contract.md`](../metadata-contract.md) for why this page carries rows, not research.

## Category boundary

Developer-facing catalogs, scaffolding, self-service workflows, scorecards, and platform interfaces that can front or partially substitute HoBo.

## Why HoBo competes here

A portal can absorb the surface developers touch. HoBo must be the control plane a portal calls, not a thing a portal replaces.

## Competitors (6)

| Competitor | Role in this category | Directness | Contested HoBo surface | Competitor advantage | HoBo distinction | Posture | Priority |
| ---------- | --------------------- | ---------- | ---------------------- | -------------------- | ---------------- | ------- | -------- |
| [**Backstage**](../backstage.md) *(primary)* | CNCF developer portal framework — complementary front-end to a HoBo control plane | complementary | `governance`, `ecosystem`, `extensibility` | Enormous plugin ecosystem and de-facto portal standard. | HoBo is the control plane beneath a portal, not the portal; Backstage is an integration target rather than a rival. | integrate, borrow | P2 |
| [**Mia-Platform**](../mia-platform.md) | enterprise platform orchestrator plus developer portal — owns the same application-to-environment span HoBo does, in one commercial suite | direct | `app-graph`, `environments`, `governance`, `agent-surface`, `extensibility`, `delivery` | Shipped enterprise suite: catalog-as-digital-twin, Scorecards/Campaigns governance, an MCP server over platform state, plus data pipelines and UI composition. | HoBo describes applications against abstract ports and scores portability; a Mia Project is configured against the infrastructure it will run on, and assumes Kubernetes. | displace, benchmark, borrow | P1 |
| [**Harness Platform**](../harness.md) | modular commercial DevOps platform whose CD, IDP, IaCM and cost modules each contest a different HoBo surface | overlapping | `delivery`, `governance`, `environments`, `finops`, `extensibility`, `observability` | Nine shipped modules on one governed platform: mature CD/GitOps with approvals and Continuous Verification, OPA policy, audit, and an outbound-only Delegate that needs no ingress. | Harness automates delivery to infrastructure you already chose; HoBo owns the layer above — a provider-abstract application description resolved by a scored, recorded decision. | benchmark, borrow, integrate | P1 |
| [**OpenChoreo**](../openchoreo.md) | open-source Kubernetes IDP with an explicit developer-intent abstraction layer and a cell-based runtime boundary | direct | `app-graph`, `environments`, `typed-contracts`, `delivery`, `governance`, `wiring` | Open source, CNCF Sandbox, self-hosted, with Cells that make isolation, traffic policy and observability boundaries enforced at runtime rather than merely described. | OpenChoreo abstracts over Kubernetes; HoBo abstracts over providers, of which Kubernetes is one — the advantage exists only for heterogeneous estates, and HoBo should concede that. | displace, borrow, benchmark | P1 |
| [**Cycloid**](../cycloid.md) | self-service portal over templated IaC whose pre-provision cost estimation and auto-generated topology view are the surfaces HoBo most visibly lacks | overlapping | `authoring`, `environments`, `finops`, `observability`, `governance`, `app-graph` | Cost visible while the choice is being made (open-source TerraCost inside StackForms) and topology diagrams generated from Terraform source so they cannot go stale. | Cycloid has no application model and decides no placement: a form cannot express a dependency graph, and governance by dropdown cannot express a context-dependent rule. | benchmark, borrow, integrate | P2 |
| [**Massdriver**](../massdriver.md) | bundle-and-artifact platform whose JSON-Schema connection contracts are the closest shipped analog to HoBo's typed capability wiring | direct | `typed-contracts`, `wiring`, `app-graph`, `environments`, `extensibility`, `governance` | The canvas doubles as a self-service surface: developers assemble typed components visually without deep cloud knowledge. | HoBo is not a portal — its graph is derived from an event log, and portals like Backstage are integration targets rather than competing surfaces. | displace, borrow, benchmark | P2 |

## Navigation

- [All categories](index.md) · [corpus index](../index.md) · [cross-category matrix](../matrix.md) · [gap analysis](../gap-analysis.md)
