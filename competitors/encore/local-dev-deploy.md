# Encore — local dev, deploy & AI

> Part of the [Encore reference](./README.md). The inner loop, deployment paths, and AI surface. Source: [github.com/encoredev/encore](https://github.com/encoredev/encore) · [encore.cloud](https://encore.cloud/) — summarized for analysis.

## Local development loop
- **`encore run`** starts the whole system locally with **real Postgres, real pub/sub semantics, and distributed tracing** — not mocks. This is high-fidelity local dev: the same resource declarations that provision in prod run against real local equivalents.
- **Dev dashboard at `localhost:9400`** — real-time service list, **distributed traces**, database browser, and **auto-generated architecture diagrams** of the app graph.
- **Infrastructure "namespaces"** — isolated infra state per branch, so parallel work doesn't collide.

## Deployment paths
- **Self-host (OSS, MPL-2.0):** `encore build docker` produces a **standalone Docker image**; you provision the infra and run it (Terraform/your own tooling). The framework + CLI + self-host are open source.
- **Encore Cloud (commercial):** the managed platform provisions resources **in your own AWS/GCP account**, manages **per-PR preview environments** for end-to-end testing, handles **least-privilege IAM**, and provides distributed tracing + **cost analytics**. Persistent environments (staging/prod) are provisioned into your account.

## AI / agent surface
- **MCP server** that lets AI agents **introspect the application graph** — services, APIs, databases, traces — so agents can reason about and validate changes.
- `encore app create` can **generate AI-tool rules files** (Cursor, Claude Code, …) and wire the MCP server.
- Positioned explicitly for **AI-assisted development**: the fast local→cloud loop lets agents validate against real infra immediately.

## HoBo comparison (sharp points)
- **Local fidelity:** Encore's "real Postgres + real pub/sub locally" is the bar HoBo's `hobo dev` targets — and HoBo formalizes it as a **fidelity matrix** (simulate/mock/Camp-only) with **`hobo verify` splitting local vs Camp checks** so "works locally" is an honest, bounded promise ([ADR-0042](../../docs/design/adr/ADR-0042-local-dev-fidelity.md)). Encore's dashboard `:9400` ≈ HoBo's dashboard ([Plan 7](../../docs/design/07-ui-dashboard.md)) + observability ([Plan 14](../../docs/design/14-observability.md)).
- **Preview environments / namespaces** ≈ HoBo **ephemeral/preview Camps + Deltas→Sets** ([Plan 26](../../docs/design/26-environments-deltas.md)).
- **MCP for agents:** both expose an MCP surface; HoBo goes further — agents are **first-class authenticated principals** with brokered tokens + audit ([Plan 6](../../docs/design/06-ai-native-agent-auth.md)), and HoBo adds **AI-generated providers** (Forge, [Plan 33](../../docs/design/33-forge-generation-pipeline.md)) and **trainable semantic functions** ([Plan 23](../../docs/design/23-stubbable-ai-implementations.md)).
- **Self-host vs managed:** Encore mirrors HoBo's OSS-core + hosted-platform split ([ADR-0020](../../docs/design/adr/ADR-0020-monetization-model.md)) — but Encore's OSS self-host leaves provisioning to you, whereas HoBo's **Yard is itself a Bindle** (self-host = hosted parity, [Plan 4](../../docs/design/04-control-plane.md)), and HoBo's **metering/quota/showback is OSS, only chargeback is hosted** ([ADR-0039](../../docs/design/adr/ADR-0039-billing-quota-cost-attribution.md)).
- **Migration:** HoBo adds an explicit **`hobo import` adopt-in-place** path from existing estates ([ADR-0041](../../docs/design/adr/ADR-0041-migration-onboarding.md)); Encore is greenfield-leaning.
