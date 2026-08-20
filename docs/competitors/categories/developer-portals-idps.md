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

## Competitors (2)

| Competitor | Role in this category | Directness | Contested HoBo surface | Competitor advantage | HoBo distinction | Posture | Priority |
| ---------- | --------------------- | ---------- | ---------------------- | -------------------- | ---------------- | ------- | -------- |
| [**Backstage**](../backstage.md) *(primary)* | CNCF developer portal framework — complementary front-end to a HoBo control plane | complementary | `governance`, `ecosystem`, `extensibility` | Enormous plugin ecosystem and de-facto portal standard. | HoBo is the control plane beneath a portal, not the portal; Backstage is an integration target rather than a rival. | integrate, borrow | P2 |
| [**Mia-Platform**](../mia-platform.md) | enterprise platform orchestrator plus developer portal — owns the same application-to-environment span HoBo does, in one commercial suite | direct | `app-graph`, `environments`, `governance`, `agent-surface`, `extensibility`, `delivery` | Shipped enterprise suite: catalog-as-digital-twin, Scorecards/Campaigns governance, an MCP server over platform state, plus data pipelines and UI composition. | HoBo describes applications against abstract ports and scores portability; a Mia Project is configured against the infrastructure it will run on, and assumes Kubernetes. | displace, benchmark, borrow | P1 |

## Navigation

- [All categories](index.md) · [corpus index](../index.md) · [cross-category matrix](../matrix.md) · [gap analysis](../gap-analysis.md)
