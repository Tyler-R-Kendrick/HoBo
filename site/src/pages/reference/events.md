---
layout: ../../layouts/Docs.astro
title: Event families
description: "Canonical event-family prefixes used in design and code — add families to the catalog before inventing new backticked event names."
---

# Event families

Event names use `family.PastTenseFact` shape. The design suite keeps a **canonical inventory**; new families must be cataloged before use in design prose.

## Families you will hit often

| Family | Examples |
|---|---|
| `compat.*` | `GatePassed`, `GateFailed` |
| `contract.*` | `Observed`, `Verified`, `EffectDeclared`, `EffectInvoked` |
| `policy.*` | `Decided`, `ObligationCreated`, `ObligationSatisfied` |
| `gatekeeper.*` | `Decided` |
| `resilience.*` | `Attempt`, `Terminal` |
| `actor.*` | `Activated`, `StateAppended`, `Passivated` |
| `crew.*` | `AgentDispatched`, `ActionProposed`, `ActionApplied`, `HandoffRequested` |
| `incident.*` | Opened → … → Resolved / PostmortemFiled |
| `run.*` | `Started`, `StepCompleted` |
| `deployment.*` | Planned / Applied / Deployed / Failed |
| `broker.*` | `Resolved`, `Rejected` |

## Rules

- Domain facts stay on domain families; Crew roster facts use thin `crew.*` — **no per-operator event silos**.
- Inspection and audit are **replay of the log**, not process memory.
- Lane-origin experimental events are tagged and excluded from baseline contract promotion by default.

## Related

[Architecture](/HoBo/guide/architecture/) · [Crew shared model](/HoBo/crew/shared-model/)
