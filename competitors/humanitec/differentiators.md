# Humanitec — Differentiators & Gaps (quick reference)

> Part of the [Humanitec competitor reference](./README.md). Condensed; full positioning in [pricing-positioning.md](./pricing-positioning.md).

## Differentiators (what's genuinely strong)
1. **Dynamic configuration management** — Score (intent) + Resource Definitions (rules) + **Matching** → environment-specific config generated at deploy time. The cleanest dev-vs-platform separation in the market.
2. **Resource Graph** — a real, queryable DAG of app + infra with co-provisioning and output flow; topologically executed.
3. **Driver model** — IaC-agnostic execution (terraform/template/echo/container/custom-webhook); extend by HTTP.
4. **Deployment Sets + Deltas** — immutable snapshots + mutable diffs → clean promote/rollback/preview + incremental deploys.
5. **Governance** — RBAC (org/app/env-type), approval workflows, drift detection, immutable audit.
6. **Enterprise reach** — SaaS + self-hosted + air-gapped; the Agent for private networks; regulated/sovereign markets.
7. **Ecosystem** — Resource Packs, open Score spec, Terraform provider, open-source drivers, MCP (AI agents).

## Gaps (HoBo's openings)
1. **K8s-centric; weak serverless** — no first-class Cloud Run/Lambda compute → HoBo leads with **wasm components + OCI fallback**, polyglot.
2. **Steep learning curve** — many concepts → HoBo's **IfC-default** authoring + mapping-as-sugar keeps the simple path simple.
3. **Opaque pricing + proprietary** → HoBo **OSS core**, self-host = hosted.
4. **Opaque matching selection** → HoBo records **`match.Decided`** events ("why this infra"), replayable.
5. **No event-sourcing/replay/time-travel** → HoBo's core is event-sourced (audit + DR + run inspector).
6. **Human-authored Resource Definitions/Packs** → HoBo's **Forge** can AI-generate definitions + packs, gated by conformance.
7. **Not a full observability platform** → HoBo bundles run inspector/traces/replay.
8. **Vendor lock-in (Manifests)** → HoBo ports are **WIT interfaces** (standards-based); Score importable for interop.

> Net: Humanitec proves the orchestrator abstraction and governance; HoBo adopts that engine and adds a polyglot wasm runtime, event-sourced auditability, AI-native generation, and OSS openness.
