# Dapr — building blocks

> Part of the [Dapr reference](./README.md). The portable APIs Dapr exposes; each is backed by one or more swappable [components](./components-model.md). Source: [docs.dapr.io/concepts/building-blocks-concept](https://docs.dapr.io/concepts/building-blocks-concept/) — quoted/summarized for analysis.

Dapr ships **12 building blocks** (HTTP/gRPC APIs):

| # | Building block | What it does | HoBo's nearest port/primitive |
|---|---|---|---|
| 1 | **Service invocation** | service→service HTTP/gRPC with discovery, retries, mTLS, tracing | `wasi:http` + SVID mTLS ([Plan 13](../../docs/design/security-networking.md#plan-13)) |
| 2 | **Publish & subscribe** | topic-based messaging, multiple brokers | `wasi:messaging` / `topic()` ([Plan 21](../../docs/design/authoring-resources-wiring.md#plan-21)) |
| 3 | **Workflows** | durable, long-running multi-service processes | `hobo:workflow` / `workflow`+`step` ([Plan 2](../../docs/design/sdk-api.md#plan-02)) |
| 4 | **State management** | key/value with pluggable stores + consistency | `wasi:keyvalue` / `kv()` |
| 5 | **Bindings** | input/output connectors to external systems (triggers + outputs) | provider adapters + `hobo:blob-events`/triggers |
| 6 | **Actors** | virtual-actor model, single-threaded, GC'd | `hobo:actor` / Grain ([Plan 2](../../docs/design/sdk-api.md#plan-02)) |
| 7 | **Secrets** | read secrets from cloud/local/K8s stores | `hobo:secrets` / secretless-first ([Plan 31](../../docs/design/authoring-resources-wiring.md#plan-31)) |
| 8 | **Configuration** | read + subscribe to app config items | `hobo:control/config` / `ctx.config` ([Plan 31](../../docs/design/authoring-resources-wiring.md#plan-31)) |
| 9 | **Distributed lock** | resource locking across instances | ActorHost single-writer lease ([Plan 5](../../docs/design/reliability-observability-cost.md#plan-05)) |
| 10 | **Cryptography** | encrypt/decrypt without exposing keys to the app | envelope encryption + KMS ([Plan 12](../../docs/design/security-networking.md#plan-12)) |
| 11 | **Jobs** | schedule/orchestrate batch + maintenance tasks | `hobo:scheduler` / `schedule()` + `hobo:job` |
| 12 | **Conversation** | call LLMs with prompt caching + PII obfuscation | `"use training"`/`agent()` + training-engine ([Plan 23](../../docs/design/forge-generated-stack.md#plan-23)/[ADR-0025](../../docs/design/adr/06-ai-generation-operators.md#adr-0025)) |

**Observation for HoBo.** This list is almost a one-to-one match for HoBo's WIT ports + runtime primitives — strong validation that the **ports/adapters spine is the right shape**. The difference is *where the abstraction lives*: Dapr's are **runtime sidecar APIs** (you still provision the backends and run the sidecars); HoBo's are **WIT ports that the control plane both provisions (`realize()`) and serves**, unifying "create the infra" + "use the infra" behind one declaration ([Plan 3](../../docs/design/control-plane.md#plan-03)/[Plan 20](../../docs/design/wasm-runtime-wit.md#plan-20)).
