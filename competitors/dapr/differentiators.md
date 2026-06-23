# Dapr — differentiators & gaps (vs HoBo)

> Part of the [Dapr reference](./README.md). Where Dapr is strong, where it stops, and how that frames HoBo.

## Strengths (what Dapr does well)
- **The portable-API + pluggable-component model, proven.** CNCF-graduated with a large, community-extensible component catalog across 12 building blocks — the clearest existing validation of HoBo's ports/capability-provider spine.
- **Truly polyglot** via the sidecar (any language that speaks HTTP/gRPC).
- **Strong distributed-systems primitives**: durable **workflows**, **virtual actors**, pub/sub, state, distributed lock, cryptography — and now **agentic AI / conversation** (LLM API with PII obfuscation).
- **Security baked in**: mTLS between sidecars via SPIFFE-style identity, secret-store indirection.
- **Backend-swappable without code changes** — change component YAML, not app code.
- **Vendor-neutral** (Apache-2.0, CNCF) — no lock-in to a single cloud or company.

## Gaps (what Dapr does *not* do — HoBo's opening)
- **No provisioning / infrastructure-from-code.** Dapr abstracts *using* a backend; you still create + own Redis/Kafka/DynamoDB and wire connection settings. There's no `deploy`, no topology graph, no cloud-agnostic provisioning. **This is the biggest gap vs HoBo** (and vs Encore/Nitric).
- **Sidecar tax + K8s-centric prod.** A sidecar per app instance (latency/memory/lifecycle) and a Kubernetes control plane in production — operational weight HoBo's in-process wasm component-host ([ADR-0031](../../docs/design/adr/01-architecture-core.md#adr-0031)) avoids.
- **No control-plane planes.** No cost/FinOps, policy/`can-deploy` contracts, or matching/Resource-Definitions layer; governance is left to the platform around it.
- **No infra event-sourcing / audit-replay.** Dapr traces requests, but doesn't event-source *infra + credential changes* the way HoBo does ([Plan 11](../../docs/design/11-event-model.md)).
- **Adapters are hand-written.** No AI-generated-adapter pipeline or conformance-as-trust-boundary (HoBo's Forge, [Plan 33](../../docs/design/33-forge-generation-pipeline.md)).

## Comparisons
- **vs HoBo:** Dapr is a **runtime/data-plane** abstraction (use-the-infra); HoBo is a **control-plane + runtime** abstraction (provision-*and*-use, agnostic, event-sourced, AI-native). They could even compose — a HoBo `Camp` could realize ports onto a Dapr-backed runtime, or Dapr components could inspire HoBo capability providers.
- **vs Nitric / Encore:** Nitric and Encore are **infrastructure-from-code** (declare-and-provision); Dapr is **runtime-only** (declare-the-API, bring-the-infra). HoBo spans both (IfC provisioning *plus* portable runtime ports).
- **vs Aspire:** Aspire composes/orchestrates app + resources for **local dev + deploy**; Dapr is the **runtime API layer** an Aspire-composed app might *call*. (Aspire even has first-class Dapr integration.)
- **vs a service mesh (Istio/Linkerd):** overlapping on mTLS/discovery, but Dapr is **app-level building-block APIs**, not transparent L7 networking.

**Net:** Dapr is the strongest evidence that HoBo's ports/adapters bet is sound — and a sharp reminder that HoBo's *differentiation* is everything **above** the runtime API: provisioning (IfC), the control-plane planes (cost/policy/contracts/matching), event-sourced audit, agents-as-principals, and AI-generated adapters.
