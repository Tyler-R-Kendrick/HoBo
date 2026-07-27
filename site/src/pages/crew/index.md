---
layout: ../../layouts/Docs.astro
title: Meet the Crew
description: "HoBo ships built-in operator agents in the Yard: SRE, Endpoint Monitor, GitOps, Platform Engineer, SWE, UX Designer, and FinOps — policy-gated, event-sourced, MCP-reachable."
---

# Meet the Crew

HoBo is AI-native: the work a software and platform team does — triage incidents, watch endpoints, drive delivery, author platform rules, write and repair application code, generate UI, and advise on cost — is exactly what agents can do against an event-sourced, MCP-complete surface. Rather than leave every team to wire its own, HoBo **ships the Crew** as built-in Yard services: opinionated, audited, policy-gated, and sandboxed under enforced AI governance, while remaining **pluggable** (each brain is an engine behind a port).

## Disambiguation

| Term | Meaning |
|---|---|
| **Operator Agent (Crew)** | Built-in Yard autonomous principal (this section) |
| **Agents-as-users** | External/customer agents acting for a developer ([Agents](/HoBo/agents/)) |
| **`agent()` primitive** | SDK runtime building block both kinds use |
| **Relay** | Outbound network proxy — *not* an agent |

## Roster

| Operator | Mission | Deep dive |
|---|---|---|
| **SRE** | Detect → diagnose → gated remediate | [SRE](/HoBo/crew/sre/) |
| **Endpoint Monitor** | Synthetics, SLO burn, drift signals | [Endpoint Monitor](/HoBo/crew/endpoint-monitor/) |
| **GitOps** | When/what deploys; env promotion | [GitOps](/HoBo/crew/gitops/) |
| **Platform Engineer** | Resource definitions, packs, policy proposals | [Platform Engineer](/HoBo/crew/platform-engineer/) |
| **SWE** | Implement / refactor / repair business code | [SWE](/HoBo/crew/swe/) |
| **UX Designer** | Generate & maintain app UI against design.md | [UX Designer](/HoBo/crew/ux-designer/) |
| **FinOps** | Forecasts, anomalies, commitments (advisory) | [FinOps](/HoBo/crew/finops/) |

## Shared guarantees

Every Crew member:

- Runs under **org RBAC** — cannot exceed its role.
- Is **event-sourced** — observations, tool calls, token grants, approvals are facts.
- Uses **MCP** for tools — same capability surface as humans where applicable.
- Has an **engine behind a port** (built-in default; swap e.g. HolmesGPT for SRE).
- **Reads/diagnoses autonomously**; **writes are policy-gated** (often require-approval in prod).

Details: [Shared model](/HoBo/crew/shared-model/).

## Example loop

1. Endpoint Monitor emits SLO burn.
2. SRE dispatches (`crew.AgentDispatched`), diagnoses from projections.
3. Low-risk fix → canary live-fix + auto-rollback; prod fix → gated Delta + approval.
4. Everything is replayable: “why did SRE act at 02:14?” is a query.

## Related

- [HoBo for Agents](/HoBo/agents/) — external agent identity
- [MCP surface](/HoBo/agents/mcp/)
- [Chaos & availability testing](/HoBo/testing/chaos/)
