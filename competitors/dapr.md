# Dapr — competitor reference

> A faithful capture of **Dapr** (Distributed Application Runtime) for HoBo competitive analysis. Dapr is the **closest architectural analog** to HoBo's ports/adapters + capability-provider model — portable building-block APIs with **pluggable components** behind them — but it operates at the **runtime/sidecar** layer, not as a cloud-agnostic **control plane / infrastructure-from-code** system. Source: [dapr.io](https://dapr.io/) · [docs.dapr.io](https://docs.dapr.io/concepts/building-blocks-concept/). Excerpts quoted for analysis (see [`../README.md`](README.md#sources--fair-use)).

## What it is

Dapr is a **CNCF-graduated, open-source (Apache-2.0) distributed-application runtime**. It exposes a set of **building blocks** — standard HTTP/gRPC APIs for the hard parts of distributed systems (state, pub/sub, service invocation, actors, workflows, secrets, …) — that your app calls locally, while **components** (pluggable adapters) implement each API against a concrete backend (Redis, Kafka, DynamoDB, …). Dapr runs as a **sidecar** next to your app (a separate process / container), so it's **language-agnostic**: any app that can make an HTTP/gRPC call gets the building blocks.

```
your app  ──HTTP/gRPC──▶  Dapr sidecar (daprd)  ──▶  component (Redis / Kafka / DynamoDB / …)
                              │
                       building-block API (state / pubsub / invoke / actors / …)
```

The mental model has three pieces:
- **Building block = a portable API** ("a building block is an HTTP or gRPC API that can be called from your code and uses one or more Dapr components"). Your code targets the building-block API, not the backend.
- **Component = a swappable adapter** behind a building block, configured by **component YAML** (type + metadata + secrets). Swap Redis→DynamoDB behind the `state` API with no code change — *exactly* HoBo's port/adapter swap, but at runtime via config.
- **Sidecar** = the runtime that hosts building blocks + name resolution + mTLS + observability, deployed per-app in **self-hosted** or **Kubernetes** mode.

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

## Feature surface

### The 12 building blocks

The portable HTTP/gRPC APIs Dapr exposes; each is backed by one or more swappable components. Source: [docs.dapr.io/concepts/building-blocks-concept](https://docs.dapr.io/concepts/building-blocks-concept/) — quoted/summarized for analysis.

| # | Building block | What it does | HoBo's nearest port/primitive |
|---|---|---|---|
| 1 | **Service invocation** | service→service HTTP/gRPC with discovery, retries, mTLS, tracing | `wasi:http` + SVID mTLS ([Plan 12](../docs/design/security-networking.md#plan-12)) |
| 2 | **Publish & subscribe** | topic-based messaging, multiple brokers | `wasi:messaging` / `topic()` ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) |
| 3 | **Workflows** | durable, long-running multi-service processes | `hobo:workflow` / `workflow`+`step` ([Plan 2](../docs/design/sdk-api.md#plan-02)) |
| 4 | **State management** | key/value with pluggable stores + consistency | `wasi:keyvalue` / `kv()` |
| 5 | **Bindings** | input/output connectors to external systems (triggers + outputs) | provider adapters + `hobo:blob-events`/triggers |
| 6 | **Actors** | virtual-actor model, single-threaded, GC'd | `hobo:actor` / Grain ([Plan 2](../docs/design/sdk-api.md#plan-02)) |
| 7 | **Secrets** | read secrets from cloud/local/K8s stores | `hobo:secrets` / secretless-first ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) |
| 8 | **Configuration** | read + subscribe to app config items | `hobo:control/config` / `ctx.config` ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) |
| 9 | **Distributed lock** | resource locking across instances | ActorHost single-writer lease ([Plan 5](../docs/design/reliability-observability-cost.md#plan-05)) |
| 10 | **Cryptography** | encrypt/decrypt without exposing keys to the app | envelope encryption + KMS ([Plan 12](../docs/design/security-networking.md#plan-12)) |
| 11 | **Jobs** | schedule/orchestrate batch + maintenance tasks | `hobo:scheduler` / `schedule()` + `hobo:job` |
| 12 | **Conversation** | call LLMs with prompt caching + PII obfuscation | `"use training"`/`agent()` + training-engine ([Plan 23](../docs/design/forge-generated-stack.md#plan-23)/[ADR-0025](../docs/design/adr/06-ai-generation-operators.md#adr-0025)) |

This list is almost a one-to-one match for HoBo's WIT ports + runtime primitives — strong validation that the **ports/adapters spine is the right shape**. The difference is *where the abstraction lives*: Dapr's are **runtime sidecar APIs** (you still provision the backends and run the sidecars); HoBo's are **WIT ports that the control plane both provisions (`realize()`) and serves**, unifying "create the infra" + "use the infra" behind one declaration ([Plan 4](../docs/design/control-plane.md#plan-04)/[Plan 20](../docs/design/wasm-runtime-wit.md#plan-20)).

### Components — the adapter layer

A **component** implements a building-block API for a concrete backend. Each is declared in **component YAML**: a `type` (e.g. `state.redis`, `pubsub.kafka`, `bindings.aws.s3`), `version`, and `metadata` (connection settings, often referencing a secret). The app calls the building-block API (`/v1.0/state/<store>`); Dapr routes to the configured component. Swapping the backend = changing the component YAML, **no app change** — the same late-binding HoBo gets from **links** ([Plan 20](../docs/design/wasm-runtime-wit.md#plan-20)).

Component categories mirror the building blocks: `state`, `pubsub`, `bindings` (input/output), `secretstores`, `configuration`, `lock`, `crypto`, `workflowbackend`, `conversation`, plus **name resolution** (service discovery: mDNS / Kubernetes / Consul) and **middleware** (HTTP pipeline). The catalog is large and community-extensible (a Go interface per category). Source: [docs.dapr.io/concepts/components-concept](https://docs.dapr.io/concepts/components-concept/).

### Sidecar architecture

Dapr runs as a **sidecar process** (`daprd`) next to each app instance. The app talks to `localhost:<port>` over HTTP/gRPC; the sidecar provides the building blocks, mTLS between sidecars (SPIFFE-style identity), retries/resiliency policies, and OpenTelemetry tracing/metrics. Because the contract is a network API, **any language** works — Dapr ships SDKs but they're thin clients over the same endpoints.

### Deployment models

- **Self-hosted:** `dapr init` installs the runtime + a default Redis (state/pubsub) + Zipkin locally; each app is launched with a sidecar (`dapr run`). Good for dev and non-K8s hosts.
- **Kubernetes (prod-typical):** the Dapr control plane (operator, sidecar-injector, placement service for actors, sentry for mTLS certs) runs in-cluster; an annotation injects a sidecar per pod. Production Dapr is **K8s-centric**.

### What Dapr deliberately does *not* do

- **Provision the backends.** Components *use* Redis/Kafka/DynamoDB; you create them yourself (Terraform/Helm/cloud console). Dapr has no IaC/`deploy`/topology layer.
- **Model cost / policy / contracts / topology** as first-class planes.
- **Event-source infra changes** or provide an audit/replay of "what changed and why."

This matters for HoBo because Dapr proves the **portable-API + pluggable-adapter** pattern at scale (CNCF-graduated, huge component catalog) — strong validation of HoBo's ports/capability-providers. HoBo's deltas: it pushes the *same* abstraction **up into the control plane** (one `.allow()`-scoped declaration drives provisioning **+** the runtime link **+** the token, [Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)), runs adapters **in-process as wasm components** (no per-app sidecar, [ADR-0031](../docs/design/adr/01-architecture-core.md#adr-0031)), makes the **conformance suite the trust boundary** for adapters (incl. **Forge-generated** ones, [Plan 23](../docs/design/forge-generated-stack.md#plan-23)), and **event-sources** every infra + credential fact ([Plan 11](../docs/design/event-model.md#plan-11)).

## Differentiators

### Strengths (what Dapr does well)

- **The portable-API + pluggable-component model, proven.** CNCF-graduated with a large, community-extensible component catalog across 12 building blocks — the clearest existing validation of HoBo's ports/capability-provider spine.
- **Truly polyglot** via the sidecar (any language that speaks HTTP/gRPC).
- **Strong distributed-systems primitives**: durable **workflows**, **virtual actors**, pub/sub, state, distributed lock, cryptography — and now **agentic AI / conversation** (LLM API with PII obfuscation).
- **Security baked in**: mTLS between sidecars via SPIFFE-style identity, secret-store indirection.
- **Backend-swappable without code changes** — change component YAML, not app code.
- **Vendor-neutral** (Apache-2.0, CNCF) — no lock-in to a single cloud or company.

### Gaps (what Dapr does *not* do — HoBo's opening)

- **No provisioning / infrastructure-from-code.** Dapr abstracts *using* a backend; you still create + own Redis/Kafka/DynamoDB and wire connection settings. There's no `deploy`, no topology graph, no cloud-agnostic provisioning. **This is the biggest gap vs HoBo** (and vs Encore/Nitric).
- **Sidecar tax + K8s-centric prod.** A sidecar per app instance (latency/memory/lifecycle) and a Kubernetes control plane in production — operational weight HoBo's in-process wasm component-host ([ADR-0031](../docs/design/adr/01-architecture-core.md#adr-0031)) avoids.
- **No control-plane planes.** No cost/FinOps, policy/`can-deploy` contracts, or matching/Resource-Definitions layer; governance is left to the platform around it.
- **No infra event-sourcing / audit-replay.** Dapr traces requests, but doesn't event-source *infra + credential changes* the way HoBo does ([Plan 11](../docs/design/event-model.md#plan-11)).
- **Adapters are hand-written.** No AI-generated-adapter pipeline or conformance-as-trust-boundary (HoBo's Forge, [Plan 23](../docs/design/forge-generated-stack.md#plan-23)).

### Comparisons

- **vs HoBo:** Dapr is a **runtime/data-plane** abstraction (use-the-infra); HoBo is a **control-plane + runtime** abstraction (provision-*and*-use, agnostic, event-sourced, AI-native). They could even compose — a HoBo `Camp` could realize ports onto a Dapr-backed runtime, or Dapr components could inspire HoBo capability providers.
- **vs Nitric / Encore:** Nitric and Encore are **infrastructure-from-code** (declare-and-provision); Dapr is **runtime-only** (declare-the-API, bring-the-infra). HoBo spans both (IfC provisioning *plus* portable runtime ports).
- **vs Aspire:** Aspire composes/orchestrates app + resources for **local dev + deploy**; Dapr is the **runtime API layer** an Aspire-composed app might *call*. (Aspire even has first-class Dapr integration.)
- **vs a service mesh (Istio/Linkerd):** overlapping on mTLS/discovery, but Dapr is **app-level building-block APIs**, not transparent L7 networking.

**Net:** Dapr is the strongest evidence that HoBo's ports/adapters bet is sound — and a sharp reminder that HoBo's *differentiation* is everything **above** the runtime API: provisioning (IfC), the control-plane planes (cost/policy/contracts/matching), event-sourced audit, agents-as-principals, and AI-generated adapters.

## HoBo mapping

> HoBo's equivalent for each Dapr concept (✅ has · ➕ goes further · 🔜 planned), and where the two architectures diverge.

| Dapr concept | HoBo equivalent | Notes |
|---|---|---|
| **Building block** (portable HTTP/gRPC API) | **WIT port** ([Plan 20](../docs/design/wasm-runtime-wit.md#plan-20)) | ✅ same idea; HoBo's contract is a WIT interface (typed, conformance-tested) rather than an HTTP/gRPC convention |
| **Component** (swappable adapter + YAML) | **Capability provider + link** ([Plan 4](../docs/design/control-plane.md#plan-04)/[Plan 20](../docs/design/wasm-runtime-wit.md#plan-20)) | ✅ swap-without-code-change; HoBo links are late-bound + capability-scoped by `.allow()` |
| **Sidecar** (per-app runtime) | **`component-host`** (in-process wasm) ([ADR-0031](../docs/design/adr/01-architecture-core.md#adr-0031)) | ➕ no per-app sidecar tax; wasm-in-container default, runs anywhere a container runs |
| **State / pub/sub / bindings / actors / workflow / secrets / config / lock / crypto / jobs** | the matching HoBo ports/primitives (12-building-blocks table above) | ✅ near 1:1 — validates HoBo's port catalog |
| **Conversation** (LLM API) | `agent()` + `"use training"` + training-engine ([Plan 23](../docs/design/forge-generated-stack.md#plan-23)/[ADR-0025](../docs/design/adr/06-ai-generation-operators.md#adr-0025)) | ➕ HoBo treats AI as trainable semantic functions + durable agents-as-principals, not just an LLM call |
| **mTLS via SPIFFE-style identity** | SVID identity + brokered tokens ([Plan 6](../docs/design/ai-native-agent-auth.md#plan-06)/[Plan 12](../docs/design/security-networking.md#plan-12)) | ✅ same SPIFFE lineage; HoBo extends it to agents + end-users as one PrincipalRef ([ADR-0038](../docs/design/adr/02-identity-security.md#adr-0038)) |
| **Name resolution** (mDNS/K8s/Consul) | identity-based service discovery ([Plan 12](../docs/design/security-networking.md#plan-12)) | ✅ HoBo discovers by SVID/logical name across providers |
| **Component YAML** | `.allow()` declaration → IAM + link + token (one decl, three effects) ([Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) | ➕ HoBo unifies grant + wiring + provisioning in one place |
| **Self-host / Kubernetes** | self-hostable Yard; K8s is *one* execution adapter, not the foundation ([ADR-0001](../docs/design/adr/README.md)) | ➕ HoBo isn't K8s-centric in prod |
| *(none — Dapr doesn't provision)* | **Provisioning / IfC**: `realize()` + Planner + IaC adapters ([Plan 4](../docs/design/control-plane.md#plan-04)/[Plan 21](../docs/design/authoring-resources-wiring.md#plan-21)) | ➕ HoBo *creates* the infra, not just uses it |
| *(none)* | **Control-plane planes**: cost ([Plan 5](../docs/design/reliability-observability-cost.md#plan-05)), policy/`can-deploy` ([Plan 29](../docs/design/contracts-policy-flags.md#plan-29)), matching/Resource-Definitions ([Plan 25](../docs/design/platform-engineering.md#plan-25)) | ➕ governance HoBo makes first-class |
| *(none)* | **Event-sourced infra + credential audit** ([Plan 11](../docs/design/event-model.md#plan-11)) | ➕ replay/time-travel/"why" for every infra + token change |
| *(hand-written components)* | **Forge** — AI-generated, conformance-gated adapters ([Plan 23](../docs/design/forge-generated-stack.md#plan-23)) | ➕ adapter breadth without a community bottleneck |

**The one-line takeaway:** Dapr ≈ HoBo's runtime ports + capability providers, made concrete at the sidecar layer — and nothing above it. HoBo's whole differentiation is the layers Dapr leaves out: provisioning (IfC), the agnostic control plane with cost/policy/contracts/matching, event-sourced audit, agents/end-users as first-class principals, and AI-generated adapters. The closeness of the *runtime* mapping is the strongest external validation that HoBo's ports/adapters foundation is the right one.

**Could Dapr compose with HoBo?** Plausibly: a `Camp` could offer a **Dapr-backed runtime adapter** (realize HoBo ports onto Dapr building blocks where a team already runs Dapr), and Dapr's component catalog is a useful reference corpus for **Forge-generated** HoBo capability providers. Tracked as an idea, not a committed integration.
