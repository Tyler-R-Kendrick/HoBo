---
type: Competitive Reference
title: "FinOps, Governance & Placement — category index"
description: "Category index: Cost visibility, allocation, estimation, optimization, policy, governance, and placement systems."
tags: [hobo, competitors, category]
---

# FinOps, Governance & Placement

> Category index. Full research lives in each canonical capture — see [`../metadata-contract.md`](../metadata-contract.md) for why this page carries rows, not research.

## Category boundary

Cost visibility, allocation, estimation, optimization, policy, governance, and placement systems.

## Why HoBo competes here

HoBo's budget-aware provider matching decides cost *before* spend. FinOps tools mostly explain spend afterwards — the contest is over where the decision happens.

## Competitors (2)

| Competitor | Role in this category | Directness | Contested HoBo surface | Competitor advantage | HoBo distinction | Posture | Priority |
| ---------- | --------------------- | ---------- | ---------------------- | -------------------- | ---------------- | ------- | -------- |
| [**FinOps tooling cohort**](../finops-tooling.md) *(primary)* | cohort capture of cost allocation/estimation/optimization tooling; superseded per product as individual captures land | adjacent | `finops`, `governance`, `provider-matching` | Mature, granular cost allocation and estimation with wide integrations. | HoBo folds cost into placement decisions at deploy time rather than reporting after the fact. | benchmark, integrate | P2 |
| [**Antimetal**](../antimetal.md) | AI-native production-operations layer (world model, RCA, agent handoff) — SRE/operator benchmark | adjacent | `observability`, `agent-surface`, `finops` | Shipped autonomous RCA and remediation with a production world model. | HoBo's agent surface is contract- and policy-gated at the boundary, with audited decisions rather than opaque fixes. | benchmark, integrate | P1 |

## Navigation

- [All categories](index.md) · [corpus index](../index.md) · [cross-category matrix](../matrix.md) · [gap analysis](../gap-analysis.md)
