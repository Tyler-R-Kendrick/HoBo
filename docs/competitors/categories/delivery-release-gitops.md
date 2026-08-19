---
type: Competitive Reference
title: "Delivery, Release & GitOps — category index"
description: "Category index: Delivery controllers, release orchestration, GitOps reconciliation, environment promotion, rollout strategies, runbooks, and deployment lifecycle systems."
tags: [hobo, competitors, category]
---

# Delivery, Release & GitOps

> Category index. Full research lives in each canonical capture — see [`../metadata-contract.md`](../metadata-contract.md) for why this page carries rows, not research.

## Category boundary

Delivery controllers, release orchestration, GitOps reconciliation, environment promotion, rollout strategies, runbooks, and deployment lifecycle systems.

## Why HoBo competes here

HoBo's stage gates and promotion events live here. The question is whether HoBo's event-sourced promotion model beats a dedicated delivery tool bolted on.

## Competitors (1)

| Competitor | Role in this category | Directness | Contested HoBo surface | Competitor advantage | HoBo distinction | Posture | Priority |
| ---------- | --------------------- | ---------- | ---------------------- | -------------------- | ---------------- | ------- | -------- |
| [**Octopus Deploy**](../octopus-deploy.md) *(primary)* | release orchestration and deployment automation — lesson source for promotion, stage gates and runbooks | overlapping | `delivery`, `governance`, `environments` | Deep release orchestration: lifecycles, tenants, runbooks, manual interventions. | HoBo models promotion as event-sourced stage gates inside the control plane rather than a separate deployment tool. | borrow, benchmark | P2 |

## Navigation

- [All categories](index.md) · [corpus index](../index.md) · [cross-category matrix](../matrix.md) · [gap analysis](../gap-analysis.md)
