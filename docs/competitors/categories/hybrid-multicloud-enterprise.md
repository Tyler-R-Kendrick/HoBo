---
type: Competitive Reference
title: "Hybrid & Multicloud Enterprise Orchestration — category index"
description: "Category index: Enterprise hybrid/multicloud provisioning, governance, catalog, lifecycle, and application-orchestration systems with broad control-plane overlap."
tags: [hobo, competitors, category]
---

# Hybrid & Multicloud Enterprise Orchestration

> Category index. Full research lives in each canonical capture — see [`../metadata-contract.md`](../metadata-contract.md) for why this page carries rows, not research.

## Category boundary

Enterprise hybrid/multicloud provisioning, governance, catalog, lifecycle, and application-orchestration systems with broad control-plane overlap.

## Why HoBo competes here

These systems already sell the multicloud promise to enterprises. HoBo competes on honesty — scored portability and impedance limits instead of a uniform-abstraction claim.

## Competitors (1)

| Competitor | Role in this category | Directness | Contested HoBo surface | Competitor advantage | HoBo distinction | Posture | Priority |
| ---------- | --------------------- | ---------- | ---------------------- | -------------------- | ---------------- | ------- | -------- |
| [**Crossplane**](../crossplane.md) | CNCF Kubernetes control plane for infrastructure — borrow-source and pluggable IaC adapter | overlapping | `typed-contracts`, `provider-matching`, `reconciliation`, `extensibility` | Battle-tested Kubernetes-native composition with a huge provider catalog. | HoBo does not require Kubernetes to exist: the control plane runs local, browser, or hosted on a portable SQLite EventStore. | borrow, integrate | P1 |

## Navigation

- [All categories](index.md) · [corpus index](../index.md) · [cross-category matrix](../matrix.md) · [gap analysis](../gap-analysis.md)
