---
type: Competitive Reference
title: "Self-Hosted PaaS & Server Deployment — category index"
description: "Category index: Simple self-hosted PaaS and server/container deployment systems."
tags: [hobo, competitors, category]
---

# Self-Hosted PaaS & Server Deployment

> Category index. Full research lives in each canonical capture — see [`../metadata-contract.md`](../metadata-contract.md) for why this page carries rows, not research.

## Category boundary

Simple self-hosted PaaS and server/container deployment systems.

## Why HoBo competes here

HoBo must be runnable on one box with no vendor account. These tools define what 'easy self-host' means and are the DX benchmark for that path.

## Competitors (3)

| Competitor | Role in this category | Directness | Contested HoBo surface | Competitor advantage | HoBo distinction | Posture | Priority |
| ---------- | --------------------- | ---------- | ---------------------- | -------------------- | ---------------- | ------- | -------- |
| [**ServerKit**](../serverkit.md) *(primary)* | self-hosted open-source server control panel with a Go agent fleet — node-attach/Relay reference | adjacent | `delivery`, `observability`, `identity-secrets` | Complete self-host control panel including mail, WAF, backups and an agent fleet. | HoBo's node-attach path is contract-driven and auditable rather than panel-driven. | benchmark, borrow | P3 |
| [**Anonymous container hosts**](../anon-container-hosts.md) | cohort capture of zero-key temporary container hosts used as the Examples Temporary host matrix | adjacent | `provider-matching`, `delivery` | Zero-credential, instant, throwaway hosting with no account friction. | HoBo treats these as scored Bindle provider targets under residency and policy gates, not as an unmanaged escape hatch. | benchmark, provider-target | P3 |
| [**Northflank**](../northflank.md) | full-stack PaaS with BYOC and GPU support — mature container PaaS benchmark | overlapping | `environments`, `delivery`, `governance` | Broad shipped surface — services, jobs, DBs, pipelines, BYOC, GPU. | HoBo is not a hosting business: the same manifest can target Northflank or anything else. | benchmark | P2 |

## Navigation

- [All categories](index.md) · [corpus index](../index.md) · [cross-category matrix](../matrix.md) · [gap analysis](../gap-analysis.md)
