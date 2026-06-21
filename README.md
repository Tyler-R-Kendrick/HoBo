# HoBo

> Write your app once in TypeScript. HoBo decides how to host it — and gets out of the way when you want control. Built for humans and the agents that work for them.

**HoBo** is a developer-centric, cloud-agnostic TypeScript SDK plus an intermediary cloud control plane ("the Yard"). Describe your app once through PaaS / SaaS / CaaS / IaaS abstractions; a provider pattern (ports & adapters) maps it onto real providers — agnostic by default, optimizable on demand via typed provider-specific options. The runtime is AI-native: actor-model + choreography sagas over a replayable event store, with durable workflows and agents as first-class authenticated users.

> **Status: design phase.** No **HoBo product** implementation code yet — this repository holds the design plans and requirements. (The only code present is third-party AI agent-tooling under `.agents/`, `.claude/`, and `scripts/` — see [Working in this repo with AI agents](#working-in-this-repo-with-ai-agents).) See [`docs/design/`](./docs/design/README.md).

## Design plans

The design is split into 31 independently iterable plans (`00`–`30`) under [`docs/design/`](./docs/design/README.md). Suggested reading order: **[0 Vision](./docs/design/00-vision.md) → [10 Architecture overview](./docs/design/10-architecture-overview.md) → [19 Worked example](./docs/design/19-worked-example.md)**, then the two deep plans **[2 SDK/API ⭐](./docs/design/02-sdk-api.md)** and **[6 AI-native & agent auth ⭐](./docs/design/06-ai-native-agent-auth.md)**.

| Foundations | Deep dives | Cross-cutting |
|---|---|---|
| [0 Vision](./docs/design/00-vision.md) · [1 Monorepo](./docs/design/01-monorepo.md) · [10 Architecture](./docs/design/10-architecture-overview.md) · [11 Event model](./docs/design/11-event-model.md) | [2 SDK/API ⭐](./docs/design/02-sdk-api.md) · [3 Providers/IaC](./docs/design/03-providers-iac.md) · [4 Control plane](./docs/design/04-control-plane.md) · [6 AI-native/agent-auth ⭐](./docs/design/06-ai-native-agent-auth.md) | [5 Reliability/HA](./docs/design/05-reliability-ha.md) · [12 Security](./docs/design/12-security-multitenancy.md) · [13 Networking](./docs/design/13-networking-connectivity.md) · [14 Observability](./docs/design/14-observability.md) · [16 Cost/FinOps](./docs/design/16-cost-finops.md) |
| | [7 UI](./docs/design/07-ui-dashboard.md) · [15 CLI/DX](./docs/design/15-cli-dx.md) | [8 Roadmap](./docs/design/08-roadmap.md) · [9 Verification](./docs/design/09-verification-open-questions.md) · [17 Positioning](./docs/design/17-positioning-competitive.md) · [18 ADR log](./docs/design/18-adr-log.md) · [19 Worked example](./docs/design/19-worked-example.md) |

Design inspiration: the API *feels like* [Vercel Workflows](https://workflow-sdk.dev/) for its durable `workflow`/`step` ergonomics, but the durable runtime is **HoBo-native and provided per Camp** (not Vercel's "World"). HoBo is positioned as a cloud-agnostic, AI-native alternative to closed agent-native PaaS offerings.

## Requirements (BRD / PRD / TRD)

The formal requirements layer lives in [`docs/requirements/`](./docs/requirements/README.md): a [BRD](./docs/requirements/BRD.md) (business), [PRD](./docs/requirements/PRD.md) (product), and [TRD](./docs/requirements/TRD.md) (technical) with stable `BR`/`FR`/`NFR`/`TR` IDs and an end-to-end [traceability matrix](./docs/requirements/TRD.md#traceability-matrix). Decisions made while authoring them are logged as [ADRs 0018+](./docs/design/adr/README.md).

## Working in this repo with AI agents

This repo is wired for **Claude Code**, **Cursor**, and **Codex** with five agent tools — **improve** (audit→plans), **caveman** (output compression), **ponytail** (minimalist-solution / anti-over-engineering), **headroom** (context compression, MCP), and **gbrain** (knowledge-graph memory, MCP). See [`AGENTS.md`](./AGENTS.md) and [`docs/agent-tooling.md`](./docs/agent-tooling.md); install with [`scripts/setup-agent-tools.sh`](./scripts/setup-agent-tools.sh). Note: gbrain needs an embedding API key and sends content to that provider.
