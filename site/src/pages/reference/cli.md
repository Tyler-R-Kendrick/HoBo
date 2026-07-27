---
layout: ../../layouts/Docs.astro
title: CLI surface
description: "Canonical hobo verbs by role: lifecycle, read-only diagnosis, authoring, identity, and distribution."
---

# CLI surface

The `hobo` CLI is deliberately **small and stable**. Same verbs appear as MCP tools.

## Lifecycle

| Verb | Role |
|---|---|
| `up` | Realize the object graph (build, plan, gate, provision, deploy) |
| `down` | Reverse |
| `dev` | Offline local Camp / inner loop |
| `plan` | Dry-run the up decision |
| `verify` | Unified Gatekeeper preflight |
| `can-deploy` | Producer/consumer compatibility diagnosis |

## Identity & access

| Verb | Role |
|---|---|
| `login` | Authenticate |
| `claim` | Bind anonymous deployment to an account |

## Authoring

| Verb | Role |
|---|---|
| `new` | Scaffold |
| `collect` | Resource collection → manifest IR |
| `codegen` / `build` / `stub` | Generate, compile, contract stubs |

## Observe

| Verb | Role |
|---|---|
| `inspect` | Projections / time-travel |
| `logs` | Live-tail Camp streams |
| `doctor` | Environment / portability hazards |
| `drift` | Drift + governed remediation |

## Broker (Conductor)

| Verb | Role |
|---|---|
| `broker config` | Scaffold/validate broker config |
| `broker up` | Realize placements (local zero-cost host when no cloud) |

## Notes

- Control-plane verbs map to `hobo:<resource>:<verb>` policy actions (deny-by-default).
- Docs examples are linted against the canonical verb list.

See also [The hobo CLI](/HoBo/guide/cli/) (guide) and [MCP](/HoBo/agents/mcp/).
