---
layout: ../../layouts/Docs.astro
title: CLI surface
description: "Canonical hobo verbs by role: lifecycle, diagnosis, authoring, identity, progressive delivery, broker/station, and distribution."
---

# CLI surface

The `hobo` CLI is deliberately **small and stable**. The same verbs appear as MCP tools. Docs examples are linted against the canonical verb list.

## Lifecycle

| Verb | Role |
|---|---|
| `up` | Realize the object graph (build, plan, gate, provision, deploy) |
| `down` | Reverse |
| `dev` | Offline local Camp / inner loop |
| `deploy` | Deploy-oriented delivery entry |
| `plan` | Dry-run the up decision (approvable diff) |
| `verify` | Unified Gatekeeper preflight (read-only) |
| `can-deploy` | Producer/consumer compatibility diagnosis |

`up` still runs the same gate as `verify` automatically before mutation.

## Identity, access, progressive

| Verb | Role |
|---|---|
| `login` | Authenticate |
| `claim` | Bind anonymous deployment to an account |
| `identity` | Continuous identity status / ops |
| `access` | Access / RBAC operations |
| `connection` | Connection management (Station-bound) |
| `feature` | Flags / progressive delivery (Harness) |
| `trails` | Continuous migration recipes (`status|plan|inspect`) |
| `station` | Station **ops/setup** (not app lifecycle) |
| `yard` | Yard ops surfaces |

## Authoring

| Verb | Role |
|---|---|
| `new` | Scaffold |
| `collect` | Resource collection → manifest IR |
| `codegen` | Regenerate `_generated/` (`--check` fails on drift) |
| `build` | Compile to wasm components (OCI fallback) |
| `stub` | Contract-backed stub behind a WIT port |
| `generate` | Generation pipeline entry |
| `sandbox` | Isolated lane; out-of-scope boundaries from contracts |
| `test` | Contract-backed sandbox test lane (not a jest replacement) |

## Observe & operate

| Verb | Role |
|---|---|
| `inspect` | Projections / time-travel (`run`, `deploy`, `topology`, …) |
| `logs` | Live-tail Camp Streamer |
| `replay` | **Session Replay** (every App Kit) — `list|get|open|summarize|retention|doctor` (not event-log replay) |
| `doctor` | Environment / credential / portability hazards (incl. Kafka + Dapr readiness) |
| `messaging` | Messaging plane status, Kafka realize, dry-run secretless Dapr component YAML (ADR-0138) |
| `drift` | Drift + governed remediation |
| `incident` | Incident disposition / A2H |
| `runbook` | Execute runbooks (writes still policy-gated) |
| `attest` | Signed evidence exports from audit facts |
| `erase` | Crypto-shred subject + projection rebuild |
| `derivative` | Derived implementation upgrade / conformance |

## Distribution

| Verb | Role |
|---|---|
| `add` | Install provider or listing (sig + provenance + conformance) |
| `registry` | Registry admin; signed offline bundle import |
| `import` | Adopt estate in place — never destroy/recreate on import |

## Broker (Conductor)

| Verb | Role |
|---|---|
| `broker` | Conductor config + ops; requires Station context when available |

Station context resolution: profile / `HOBO_STATION` / `--station`. Receipts pin `stationId` + `railHash`.

## Policy mapping

Control-plane verbs map to `hobo:<resource>:<verb>` policy actions (**deny-by-default**). Unmapped verbs fail conformance.

## Related

[The hobo CLI](/HoBo/guide/cli/) · [MCP](/HoBo/agents/mcp/) · [Stations](/HoBo/primitives/stations/) · [Troubleshooting](/HoBo/guide/troubleshooting/)
