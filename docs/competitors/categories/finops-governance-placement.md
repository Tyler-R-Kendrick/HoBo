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

## Competitors (5)

| Competitor | Role in this category | Directness | Contested HoBo surface | Competitor advantage | HoBo distinction | Posture | Priority |
| ---------- | --------------------- | ---------- | ---------------------- | -------------------- | ---------------- | ------- | -------- |
| [**FinOps tooling cohort**](../finops-tooling.md) *(primary)* | cohort capture of cost allocation/estimation/optimization tooling; superseded per product as individual captures land | adjacent | `finops`, `governance`, `provider-matching` | Mature, granular cost allocation and estimation with wide integrations. | HoBo folds cost into placement decisions at deploy time rather than reporting after the fact. | benchmark, integrate | P2 |
| [**Antimetal**](../antimetal.md) | AI-native production-operations layer (world model, RCA, agent handoff) — SRE/operator benchmark | adjacent | `observability`, `agent-surface`, `finops` | Shipped autonomous RCA and remediation with a production world model. | HoBo's agent surface is contract- and policy-gated at the boundary, with audited decisions rather than opaque fixes. | benchmark, integrate | P1 |
| [**Harness Platform**](../harness.md) | modular commercial DevOps platform whose CD, IDP, IaCM and cost modules each contest a different HoBo surface | overlapping | `delivery`, `governance`, `environments`, `finops`, `extensibility`, `observability` | Nine shipped modules on one governed platform: mature CD/GitOps with approvals and Continuous Verification, OPA policy, audit, and an outbound-only Delegate that needs no ingress. | Harness automates delivery to infrastructure you already chose; HoBo owns the layer above — a provider-abstract application description resolved by a scored, recorded decision. | benchmark, borrow, integrate | P1 |
| [**Facets.cloud**](../facets.md) | declarative environment orchestrator — the closest commercial product to HoBo's intent-to-provider thesis, realized through generated Terraform/Helm | direct | `app-graph`, `environments`, `provider-matching`, `governance`, `extensibility` | Cost management sits inside the same product that provisions the environment, alongside monitoring and governance. | HoBo folds cost into the placement decision itself, so budget shapes where a workload lands rather than what the bill later says. | displace, benchmark, borrow | P2 |
| [**DuploCloud**](../duplocloud.md) | compliance-first provisioning platform — competes for the same buyer by selling audit evidence rather than portability | overlapping | `governance`, `provider-matching`, `environments`, `identity-secrets`, `observability` | Continuous, framework-mapped compliance evidence (SOC 2/HIPAA/PCI/HITRUST/NIST) with drift detection, from a control plane installed inside the customer's own cloud account. | HoBo's append-only decision log is audit evidence by construction rather than generated, and residency is a typed fail-closed port — but HoBo's evidence pack is design-only today. | benchmark, borrow, displace | P2 |

## Navigation

- [All categories](index.md) · [corpus index](../index.md) · [cross-category matrix](../matrix.md) · [gap analysis](../gap-analysis.md)
