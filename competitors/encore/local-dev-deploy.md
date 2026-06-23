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
- **Local fidelity:** Encore's "real Postgres + real pub/sub locally" is the bar HoBo's `hobo dev` targets — and HoBo formalizes it as a **fidelity matrix** (simulate/mock/Camp-only) with **`hobo verify` splitting local vs Camp checks** so "works locally" is an honest, bounded promise ([ADR-0042](../../docs/design/adr/07-portability-extensibility.md#adr-0042)). Encore's dashboard `:9400` ≈ HoBo's dashboard ([Plan 7](../../docs/design/developer-experience.md#plan-07)) + observability ([Plan 14](../../docs/design/reliability-observability-cost.md#plan-14)).
- **Preview environments / namespaces** ≈ HoBo **ephemeral/preview Camps + Deltas→Sets** ([Plan 26](../../docs/design/platform-engineering.md#plan-26)).
- **MCP for agents:** both expose an MCP surface; HoBo goes further — agents are **first-class authenticated principals** with brokered tokens + audit ([Plan 6](../../docs/design/ai-native-agent-auth.md#plan-06)), and HoBo adds **AI-generated providers** (Forge, [Plan 33](../../docs/design/forge-generated-stack.md#plan-33)) and **trainable semantic functions** ([Plan 23](../../docs/design/forge-generated-stack.md#plan-23)).
- **Self-host vs managed:** Encore has an OSS-core + hosted-platform split — but Encore's OSS self-host leaves provisioning to you, whereas HoBo's **Yard is itself a Bindle** (self-host = hosted parity, [Plan 4](../../docs/design/control-plane.md#plan-04)). HoBo is OSS and ships no billing; commercialization is out of design scope ([ADR-0064](../../docs/design/adr/08-scope-and-requirements.md#adr-0064)), and its **metering/quota/showback is OSS FinOps** ([ADR-0039](../../docs/design/adr/04-governance-verification.md#adr-0039)).
- **Migration:** HoBo adds an explicit **`hobo import` adopt-in-place** path from existing estates ([ADR-0041](../../docs/design/adr/07-portability-extensibility.md#adr-0041)); Encore is greenfield-leaning.
