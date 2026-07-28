---
layout: ../../layouts/Docs.astro
title: Troubleshooting
description: "Diagnose local and remote HoBo problems: doctor, Gatekeeper denials, fences, Station missing, Bridge modes, and agent audit."
---

# Troubleshooting

Start **read-only**, then gated mutate. Prefer CLI verbs that emit machine-readable reasons.

## In this section

| Page | Topic |
|---|---|
| [Common failures](/HoBo/troubleshooting/common-failures/) | doctor, can-deploy, STALE_FENCE, schema, Station, OPFS |
| [Local debugging](/HoBo/troubleshooting/local/) | `hobo dev`, local Camp, dual fixtures |
| [Remote development](/HoBo/troubleshooting/bridge/) | Bridge modes: live / mock / bridge / replay / shadow / fault |
| [Remote debugging](/HoBo/troubleshooting/remote/) | inspect, logs, incidents against real camps |
| [Agent audit & replay](/HoBo/observability/agent-audit/) | What the agent did — in the event log |
| [Errors & codes](/HoBo/reference/errors/) | Stable machine codes (reference) |

## Quick map

| Symptom | First command |
|---|---|
| Local env weird | `hobo doctor` |
| Deploy blocked | `hobo verify` / `hobo can-deploy` |
| Policy deny | inspect `policy.Decided` — **do not retry** |
| Append OCC | reload & retry |
| `STALE_FENCE` | re-acquire lease |
| Control plane refuses | `hobo station status` |
| Agent can’t tool | scopes + MCP auth |

## Related

[Observability](/HoBo/observability/) · [CLI](/HoBo/reference/cli/) · [Anti-patterns](/HoBo/testing/anti-patterns/)
