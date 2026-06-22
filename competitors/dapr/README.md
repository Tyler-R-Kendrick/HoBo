# Dapr — competitor reference

> A faithful capture of **Dapr** (Distributed Application Runtime) for HoBo competitive analysis. Dapr is the **closest architectural analog** to HoBo's ports/adapters + capability-provider model — portable building-block APIs with **pluggable components** behind them — but it operates at the **runtime/sidecar** layer, not as a cloud-agnostic **control plane / infrastructure-from-code** system. Source: [dapr.io](https://dapr.io/) · [docs.dapr.io](https://docs.dapr.io/concepts/building-blocks-concept/). Excerpts quoted for analysis (see [`../README.md`](../README.md#sources--fair-use)).

## What it is
Dapr is a **CNCF-graduated, open-source (Apache-2.0) distributed-application runtime**. It exposes a set of **building blocks** — standard HTTP/gRPC APIs for the hard parts of distributed systems (state, pub/sub, service invocation, actors, workflows, secrets, …) — that your app calls locally, while **components** (pluggable adapters) implement each API against a concrete backend (Redis, Kafka, DynamoDB, …). Dapr runs as a **sidecar** next to your app (a separate process / container), so it's **language-agnostic**: any app that can make an HTTP/gRPC call gets the building blocks.

```
your app  ──HTTP/gRPC──▶  Dapr sidecar (daprd)  ──▶  component (Redis / Kafka / DynamoDB / …)
                              │
                       building-block API (state / pubsub / invoke / actors / …)
```

## The mental model
- **Building block = a portable API** ("a building block is an HTTP or gRPC API that can be called from your code and uses one or more Dapr components"). Your code targets the building-block API, not the backend.
- **Component = a swappable adapter** behind a building block, configured by **component YAML** (type + metadata + secrets). Swap Redis→DynamoDB behind the `state` API with no code change — *exactly* HoBo's port/adapter swap, but at runtime via config.
- **Sidecar** = the runtime that hosts building blocks + name resolution + mTLS + observability, deployed per-app in **self-hosted** or **Kubernetes** mode.

## At a glance
| Dimension | Dapr |
|---|---|
| Layer | **Runtime / data-plane** (sidecar APIs), *not* provisioning/control-plane |
| Portability | Building-block APIs are portable; **components** are the adapters (huge catalog) |
| Polyglot | ✅ any language (HTTP/gRPC sidecar) |
| Provisioning / IaC | ❌ Dapr does **not** provision the backing infra — you bring Redis/Kafka/etc. |
| Runtime model | request/response + actors + **workflows** (durable) + pub/sub |
| Deploy target | self-hosted processes or **Kubernetes** (prod is K8s-centric) |
| AI | **Conversation** building block (LLM API + PII obfuscation) + agentic features |
| License / governance | Apache-2.0, **CNCF graduated** |

## Known gaps (a competitor/HoBo could exploit)
- **No infrastructure provisioning.** Dapr abstracts *using* a backend, not *creating* it — you still provision Redis/Kafka/DynamoDB (Terraform/etc.) yourself. No IfC, no `deploy`.
- **Sidecar overhead + ops.** A sidecar per app (latency, memory, lifecycle) and, in prod, a Kubernetes operator — operational weight HoBo's in-process wasm component-host avoids.
- **Runtime-layer only.** No topology/wiring graph, no cost/policy/contracts plane, no audit/event-sourcing of infra changes, no agents-as-principals.
- **Component config is the boundary.** Components are YAML + a Go plugin interface; there's no AI-generated-adapter story (HoBo's Forge) or conformance-as-trust-boundary.

## Files
- [`building-blocks.md`](./building-blocks.md) — the 12 building blocks.
- [`components-model.md`](./components-model.md) — components, YAML, sidecar, self-host vs K8s.
- [`differentiators.md`](./differentiators.md) — strengths, gaps, comparisons.
- [`hobo-mapping.md`](./hobo-mapping.md) — Dapr ↔ HoBo (ports/capability-providers).
