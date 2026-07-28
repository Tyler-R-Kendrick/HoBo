---
layout: ../../layouts/Docs.astro
title: IaC engines
description: "Pluggable infrastructure-as-code adapters: Pulumi Automation API primary, Crossplane, Terraform/OpenTofu, and executor sandbox rules."
---

# IaC engines

Executors apply infrastructure through **IaC adapters** behind ports — sandboxed, short-lived credentials, no ambient cloud keys.

## Shipped / scaffolded

| Adapter family | Role | Status |
|---|---|---|
| **Pulumi** (`@hobo/iac-pulumi`) | Automation API — primary path | Live gated by `HOBO_PULUMI_LIVE=1` |
| **Crossplane** | Kubernetes-shaped control | Design / stage-gated |
| **Terraform / OpenTofu / CDKTF** | Familiar plan/apply | Design / adapter scaffolds |

## Rules

- Executors run in Firecracker-class isolation when available  
- Identity brokers **scoped tokens per resource + action**  
- Drift remediation is gated the same as deploy  
- Never hand long-lived provider keys to the app or the executor ambient env  

## Related

[Custom providers](/HoBo/customizations/providers/) · [Control plane](/HoBo/architecture/control-plane/) · [Stations & Conductor](/HoBo/primitives/stations/)
