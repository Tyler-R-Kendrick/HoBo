# Dapr — components, sidecar & deployment

> Part of the [Dapr reference](./README.md). How the swappable adapters behind building blocks work, and how Dapr runs. Source: [docs.dapr.io/concepts/components-concept](https://docs.dapr.io/concepts/components-concept/) — summarized for analysis.

## Components — the adapter layer
A **component** implements a building-block API for a concrete backend. Each is declared in **component YAML**: a `type` (e.g. `state.redis`, `pubsub.kafka`, `bindings.aws.s3`), `version`, and `metadata` (connection settings, often referencing a secret). The app calls the building-block API (`/v1.0/state/<store>`); Dapr routes to the configured component. Swapping the backend = changing the component YAML, **no app change** — the same late-binding HoBo gets from **links** ([Plan 20](../../docs/design/wasm-runtime-wit.md#plan-20)).

Component categories mirror the building blocks: `state`, `pubsub`, `bindings` (input/output), `secretstores`, `configuration`, `lock`, `crypto`, `workflowbackend`, `conversation`, plus **name resolution** (service discovery: mDNS / Kubernetes / Consul) and **middleware** (HTTP pipeline). The catalog of components is large and community-extensible (a Go interface per category).

## Sidecar architecture
Dapr runs as a **sidecar process** (`daprd`) next to each app instance. The app talks to `localhost:<port>` over HTTP/gRPC; the sidecar provides the building blocks, mTLS between sidecars (SPIFFE-style identity), retries/resiliency policies, and OpenTelemetry tracing/metrics. Because the contract is a network API, **any language** works — Dapr ships SDKs but they're thin clients over the same endpoints.

## Deployment models
- **Self-hosted:** `dapr init` installs the runtime + a default Redis (state/pubsub) + Zipkin locally; each app is launched with a sidecar (`dapr run`). Good for dev and non-K8s hosts.
- **Kubernetes (prod-typical):** the Dapr control plane (operator, sidecar-injector, placement service for actors, sentry for mTLS certs) runs in-cluster; an annotation injects a sidecar per pod. Production Dapr is **K8s-centric**.

## What Dapr deliberately does *not* do
- **Provision the backends.** Components *use* Redis/Kafka/DynamoDB; you create them yourself (Terraform/Helm/cloud console). Dapr has no IaC/`deploy`/topology layer.
- **Model cost / policy / contracts / topology** as first-class planes.
- **Event-source infra changes** or provide an audit/replay of "what changed and why."

## Why this matters for HoBo
Dapr proves the **portable-API + pluggable-adapter** pattern at scale (CNCF-graduated, huge component catalog) — strong validation of HoBo's ports/capability-providers. HoBo's deltas: it pushes the *same* abstraction **up into the control plane** (one `.allow()`-scoped declaration drives provisioning **+** the runtime link **+** the token, [Plan 21](../../docs/design/authoring-resources-wiring.md#plan-21)), runs adapters **in-process as wasm components** (no per-app sidecar, [ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031)), makes the **conformance suite the trust boundary** for adapters (incl. **Forge-generated** ones, [Plan 33](../../docs/design/forge-generated-stack.md#plan-33)), and **event-sources** every infra + credential fact ([Plan 11](../../docs/design/event-model.md#plan-11)).
