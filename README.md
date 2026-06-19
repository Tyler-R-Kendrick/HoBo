# HoBo

> Write your app once in TypeScript. HoBo decides how to host it — and gets out of the way when you want control. Built for humans and the agents that work for them.

**HoBo** is a developer-centric, cloud-agnostic TypeScript SDK plus an intermediary cloud control plane ("the Yard"). Describe your app once through PaaS / SaaS / CaaS / IaaS abstractions; a provider pattern (ports & adapters) maps it onto real providers — agnostic by default, optimizable on demand via typed provider-specific options. The runtime is AI-native: actor-model + choreography sagas over a replayable event store, with durable workflows and agents as first-class authenticated users.

> **Status: design phase.** No implementation code yet — this repository currently holds the design plans. See [`docs/design/`](./docs/design/README.md).

## Design plans

The design is split into 20 independently iterable plans under [`docs/design/`](./docs/design/README.md). Suggested reading order: **[0 Vision](./docs/design/00-vision.md) → [10 Architecture overview](./docs/design/10-architecture-overview.md) → [19 Worked example](./docs/design/19-worked-example.md)**, then the two deep plans **[2 SDK/API ⭐](./docs/design/02-sdk-api.md)** and **[6 AI-native & agent auth ⭐](./docs/design/06-ai-native-agent-auth.md)**.

| Foundations | Deep dives | Cross-cutting |
|---|---|---|
| [0 Vision](./docs/design/00-vision.md) · [1 Monorepo](./docs/design/01-monorepo.md) · [10 Architecture](./docs/design/10-architecture-overview.md) · [11 Event model](./docs/design/11-event-model.md) | [2 SDK/API ⭐](./docs/design/02-sdk-api.md) · [3 Providers/IaC](./docs/design/03-providers-iac.md) · [4 Control plane](./docs/design/04-control-plane.md) · [6 AI-native/agent-auth ⭐](./docs/design/06-ai-native-agent-auth.md) | [5 Reliability/HA](./docs/design/05-reliability-ha.md) · [12 Security](./docs/design/12-security-multitenancy.md) · [13 Networking](./docs/design/13-networking-connectivity.md) · [14 Observability](./docs/design/14-observability.md) · [16 Cost/FinOps](./docs/design/16-cost-finops.md) |
| | [7 UI](./docs/design/07-ui-dashboard.md) · [15 CLI/DX](./docs/design/15-cli-dx.md) | [8 Roadmap](./docs/design/08-roadmap.md) · [9 Verification](./docs/design/09-verification-open-questions.md) · [17 Positioning](./docs/design/17-positioning-competitive.md) · [18 ADR log](./docs/design/18-adr-log.md) · [19 Worked example](./docs/design/19-worked-example.md) |

Design inspiration: the API *feels like* [Vercel Workflows](https://workflow-sdk.dev/) and adopts its [Worlds](https://workflow-sdk.dev/worlds) abstraction. HoBo is positioned as a cloud-agnostic, AI-native alternative to closed agent-native PaaS offerings.
