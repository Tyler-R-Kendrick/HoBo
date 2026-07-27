---
layout: ../../layouts/Docs.astro
title: Observability
description: "Events as truth, projections, Streamer live-tail, OTel hooks, synthetics, and inspect/time-travel without a second source of truth."
---

# Observability

HoBo’s primary observability substrate is the **event log** plus rebuildable projections. Metrics and traces are first-class exports — they do not replace the log as authority.

## Layers

| Layer | Use |
|---|---|
| **Domain/control events** | Audit, recovery, agent reasoning |
| **Projections** | Dashboards, `hobo inspect`, topology |
| **Streamer** | Live logs/tokens/exec stdout |
| **Synthetics** | Endpoint Monitor SLOs |
| **OTel / SIEM** | Export; OCSF for security families |

## Principles

1. “Why did the system do X?” → **replay**, not SSH folklore.
2. Crew actions are facts (`crew.*`, tool calls, token grants).
3. Sandbox lanes are labeled so experiments do not pollute baseline views.
4. Metering showback is a projection over usage facts — [Metering](/HoBo/reference/metering/).

## Operator entry points

- `hobo inspect` — time-travel views  
- `hobo logs` — Streamer tail  
- `hobo doctor` — environment hazards  
- `hobo incident` / `hobo runbook` — SRE loop  
- Endpoint Monitor + SRE Crew for burn and remediation  

## Related

[Data plane](/HoBo/guide/data-plane/) · [Crew SRE](/HoBo/crew/sre/) · [Chaos testing](/HoBo/testing/chaos/)
