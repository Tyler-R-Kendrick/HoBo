# Nitric → HoBo parity & mapping tracker

> For every Nitric feature, the HoBo equivalent and the design doc that owns it. ✅ = designed at parity · ➕ = HoBo goes further · 🔜 = planned, see iteration hooks. Part of the [Nitric competitor reference](./README.md); HoBo design lives in [`../../docs/design/`](../../docs/design/README.md).

## Core model
| Nitric | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Infrastructure from Code (run-to-collect) | **IfC-default**: resources declared inline + `.allow()`, collected by running the wasm component in resource-collection mode → manifest IR | ✅ | [02](../../docs/design/sdk-api.md#plan-02), [22](../../docs/design/authoring-resources-wiring.md#plan-22) |
| Services (containerized entry points) | **Services = wasm/wasi components by default** (OCI container fallback) | ➕ | [20](../../docs/design/wasm-runtime-wit.md#plan-20) |
| Resources (building blocks) | HoBo resources = **WIT ports** with equivalence classes | ✅ | [21](../../docs/design/authoring-resources-wiring.md#plan-21) |
| The Membrane (gRPC runtime contract) | **WIT/wasm host boundary** (component imports → host routes to linked provider); standards-based, no bespoke proto | ➕ | [20](../../docs/design/wasm-runtime-wit.md#plan-20) |
| Resource spec | **Manifest IR** (Nitric spec ∪ Aspire manifest) consumed by the Planner | ➕ | [22](../../docs/design/authoring-resources-wiring.md#plan-22) |

## Resource catalog (full parity target)
| Nitric resource | HoBo port (WIT interface) | Status |
|---|---|---|
| `api` | `hobo:http` / `wasi:http` | ✅ |
| `kv` | `wasi:keyvalue` | ✅ |
| `bucket` (+ events, presigned) | `wasi:blobstore` (+ `hobo:blob-events`) | ✅ |
| `queue` (pull) | `hobo:queue` (`wasi:messaging` profile) | ✅ |
| `topic` (push pub/sub) | `wasi:messaging` | ✅ |
| `secret` (versioned) | `wasi:config`/`hobo:secrets` | ✅ |
| `sql` | `wasi:sql` / `hobo:sql` | ✅ |
| `schedule` (cron/interval) | `hobo:schedule` (control-plane `cron`) | ✅ |
| `websocket` | `hobo:websocket` | ✅ |
| `job` (batch, cpu/mem/gpu) | `hobo:job` (+ IaaS `vm`/`microVm`) | ✅ |
| `website` (static/SSR) | `web()` resource | ✅ |

All resources detailed with `.allow()` verbs + cross-cloud equivalence in [21](../../docs/design/authoring-resources-wiring.md#plan-21).

## Permissions, security, providers
| Nitric | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| `.allow(verbs)` → least-privilege IAM | `.allow(verbs)` drives **IAM + wasm capability grants (links) + agent token scope** (one declaration, three effects) | ➕ | [21](../../docs/design/authoring-resources-wiring.md#plan-21), [06](../../docs/design/ai-native-agent-auth.md#plan-06) |
| OIDC API auth | OIDC + **first-class agent identity (SVID)** + keyless token broker | ➕ | [06](../../docs/design/ai-native-agent-auth.md#plan-06) |
| Pulumi/Terraform providers | `iac-pulumi` (primary) + Crossplane/OpenTofu adapters | ✅ | [03](../../docs/design/control-plane.md#plan-03) |
| Provider = deploy + runtime layers | **Provider = capability provider** (deploy realize() + runtime WIT impl + link) | ✅ | [03](../../docs/design/control-plane.md#plan-03), [20](../../docs/design/wasm-runtime-wit.md#plan-20) |
| Custom providers (Go) | Provider authoring in **any wasm language** + `@hobo/conformance` gate; **AI-generated via the Forge** | ➕ | [03](../../docs/design/control-plane.md#plan-03), [23](../../docs/design/forge-generated-stack.md#plan-23) |
| Stack files (per-target) | `hobo.config.ts` + Camps (per-env) | ✅ | [02](../../docs/design/sdk-api.md#plan-02) |

## CLI, local dev, deployment
| Nitric | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| `nitric start` (emulate + dashboard) | `hobo dev` on `runtime-local` + dashboard | ✅ | [15](../../docs/design/developer-experience.md#plan-15), [07](../../docs/design/developer-experience.md#plan-07) |
| `nitric run` (containers) | `hobo dev --containers` (wasm host or OCI) | ✅ | [15](../../docs/design/developer-experience.md#plan-15) |
| `nitric up/down/spec/build` | `hobo deploy/destroy/plan/build` | ✅ | [15](../../docs/design/developer-experience.md#plan-15) |
| Local dashboard (test APIs, view kv/sql, trigger schedules, etc.) | HoBo dashboard + **run inspector / replay / link & trace views** | ➕ | [07](../../docs/design/developer-experience.md#plan-07), [14](../../docs/design/reliability-observability-cost.md#plan-14) |
| Multi-cloud, deploy to many at once | mapping rules: whole-app / per-tier / per-boundary | ✅ | [02](../../docs/design/sdk-api.md#plan-02), [03](../../docs/design/control-plane.md#plan-03) |

## Where HoBo deliberately exceeds Nitric (net-new)
| Capability | HoBo doc |
|---|---|
| **WASM/WASI-default polyglot runtime** (any language → component; capability security) | [20](../../docs/design/wasm-runtime-wit.md#plan-20) |
| **Actors + durable workflows + choreography sagas** over a replayable event store | [02](../../docs/design/sdk-api.md#plan-02), [11](../../docs/design/event-model.md#plan-11) |
| **Agents as first-class principals** + Capability Manifest + MCP control surface | [06](../../docs/design/ai-native-agent-auth.md#plan-06) |
| **AI-generated providers AND implementations**; stub → implement → trace → auto-evolve → live-fix (gated) | [23](../../docs/design/forge-generated-stack.md#plan-23) |
| **Aspire-style wiring + manifest IR** for any component/container | [22](../../docs/design/authoring-resources-wiring.md#plan-22) |
| **Reliability/HA, security/multi-tenancy, networking, cost/FinOps** as designed concerns | [05](../../docs/design/reliability-observability-cost.md#plan-05), [12](../../docs/design/security-networking.md#plan-12), [13](../../docs/design/security-networking.md#plan-13), [16](../../docs/design/reliability-observability-cost.md#plan-16) |

## Open parity items (iteration hooks)
- Bucket-event + presigned-URL semantics as a HoBo WIT extension (`hobo:blob-events`).
- WebSocket port WIT shape (no standard `wasi:websocket` yet).
- `sql` migrations workflow parity (Nitric's `migrations/<db>/*.up.sql`).
- Per-language IfC collection fidelity (run-to-collect vs static analysis).
