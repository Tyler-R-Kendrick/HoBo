# Nitric → HoBo parity & mapping tracker

> For every Nitric feature, the HoBo equivalent and the design doc that owns it. ✅ = designed at parity · ➕ = HoBo goes further · 🔜 = planned, see iteration hooks. Part of the [Nitric competitor reference](./README.md); HoBo design lives in [`../../docs/design/`](../../docs/design/README.md).

## Core model
| Nitric | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Infrastructure from Code (run-to-collect) | **IfC-default**: resources declared inline + `.allow()`, collected by running the wasm component in resource-collection mode → manifest IR | ✅ | [02](../../docs/design/02-sdk-api.md), [22](../../docs/design/22-wiring-manifest.md) |
| Services (containerized entry points) | **Services = wasm/wasi components by default** (OCI container fallback) | ➕ | [20](../../docs/design/20-wasm-wasi-runtime.md) |
| Resources (building blocks) | HoBo resources = **WIT ports** with equivalence classes | ✅ | [21](../../docs/design/21-resources-catalog.md) |
| The Membrane (gRPC runtime contract) | **WIT/wasm host boundary** (component imports → host routes to linked provider); standards-based, no bespoke proto | ➕ | [20](../../docs/design/20-wasm-wasi-runtime.md) |
| Resource spec | **Manifest IR** (Nitric spec ∪ Aspire manifest) consumed by the Planner | ➕ | [22](../../docs/design/22-wiring-manifest.md) |

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

All resources detailed with `.allow()` verbs + cross-cloud equivalence in [21](../../docs/design/21-resources-catalog.md).

## Permissions, security, providers
| Nitric | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| `.allow(verbs)` → least-privilege IAM | `.allow(verbs)` drives **IAM + wasm capability grants (links) + agent token scope** (one declaration, three effects) | ➕ | [21](../../docs/design/21-resources-catalog.md), [06](../../docs/design/06-ai-native-agent-auth.md) |
| OIDC API auth | OIDC + **first-class agent identity (SVID)** + keyless token broker | ➕ | [06](../../docs/design/06-ai-native-agent-auth.md) |
| Pulumi/Terraform providers | `iac-pulumi` (primary) + Crossplane/OpenTofu adapters | ✅ | [03](../../docs/design/03-providers-iac.md) |
| Provider = deploy + runtime layers | **Provider = capability provider** (deploy realize() + runtime WIT impl + link) | ✅ | [03](../../docs/design/03-providers-iac.md), [20](../../docs/design/20-wasm-wasi-runtime.md) |
| Custom providers (Go) | Provider authoring in **any wasm language** + `@hobo/conformance` gate; **AI-generated via the Forge** | ➕ | [03](../../docs/design/03-providers-iac.md), [23](../../docs/design/23-stubbable-ai-implementations.md) |
| Stack files (per-target) | `hobo.config.ts` + Camps (per-env) | ✅ | [02](../../docs/design/02-sdk-api.md) |

## CLI, local dev, deployment
| Nitric | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| `nitric start` (emulate + dashboard) | `hobo dev` on `runtime-local` + dashboard | ✅ | [15](../../docs/design/15-cli-dx.md), [07](../../docs/design/07-ui-dashboard.md) |
| `nitric run` (containers) | `hobo dev --containers` (wasm host or OCI) | ✅ | [15](../../docs/design/15-cli-dx.md) |
| `nitric up/down/spec/build` | `hobo deploy/destroy/plan/build` | ✅ | [15](../../docs/design/15-cli-dx.md) |
| Local dashboard (test APIs, view kv/sql, trigger schedules, etc.) | HoBo dashboard + **run inspector / replay / link & trace views** | ➕ | [07](../../docs/design/07-ui-dashboard.md), [14](../../docs/design/14-observability.md) |
| Multi-cloud, deploy to many at once | mapping rules: whole-app / per-tier / per-boundary | ✅ | [02](../../docs/design/02-sdk-api.md), [03](../../docs/design/03-providers-iac.md) |

## Where HoBo deliberately exceeds Nitric (net-new)
| Capability | HoBo doc |
|---|---|
| **WASM/WASI-default polyglot runtime** (any language → component; capability security) | [20](../../docs/design/20-wasm-wasi-runtime.md) |
| **Actors + durable workflows + choreography sagas** over a replayable event store | [02](../../docs/design/02-sdk-api.md), [11](../../docs/design/11-event-model.md) |
| **Agents as first-class principals** + Capability Manifest + MCP control surface | [06](../../docs/design/06-ai-native-agent-auth.md) |
| **AI-generated providers AND implementations**; stub → implement → trace → auto-evolve → live-fix (gated) | [23](../../docs/design/23-stubbable-ai-implementations.md) |
| **Aspire-style wiring + manifest IR** for any component/container | [22](../../docs/design/22-wiring-manifest.md) |
| **Reliability/HA, security/multi-tenancy, networking, cost/FinOps** as designed concerns | [05](../../docs/design/05-reliability-ha.md), [12](../../docs/design/12-security-multitenancy.md), [13](../../docs/design/13-networking-connectivity.md), [16](../../docs/design/16-cost-finops.md) |

## Open parity items (iteration hooks)
- Bucket-event + presigned-URL semantics as a HoBo WIT extension (`hobo:blob-events`).
- WebSocket port WIT shape (no standard `wasi:websocket` yet).
- `sql` migrations workflow parity (Nitric's `migrations/<db>/*.up.sql`).
- Per-language IfC collection fidelity (run-to-collect vs static analysis).
