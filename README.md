# HoBo

> Write your app once in TypeScript. HoBo decides how to host it — and gets out of the way when you want control. Built for humans and the agents that work for them.

**HoBo** is a developer-centric, cloud-agnostic TypeScript SDK plus an intermediary cloud control plane ("the Yard"). Describe your app once through PaaS / SaaS / CaaS / IaaS abstractions; a provider pattern (ports & adapters) maps it onto real providers — agnostic by default, optimizable on demand via typed provider-specific options. The runtime is AI-native: actor-model + choreography sagas over a replayable event store, with durable workflows and agents as first-class authenticated users.

> **Status: design phase.** No implementation code yet — this repository currently holds the design plans. See [`docs/design/`](./docs/design/README.md).

## Design plans

The design is split into independently iterable plans under [`docs/design/`](./docs/design/README.md):

- [0 — Vision, positioning & guiding principles](./docs/design/00-vision.md)
- [1 — Monorepo & package architecture](./docs/design/01-monorepo.md)
- [2 — SDK / API design ⭐](./docs/design/02-sdk-api.md)
- [3 — Providers, IaC & build/VM adapters](./docs/design/03-providers-iac.md)
- [4 — The Yard (control plane)](./docs/design/04-control-plane.md)
- [5 — Reliability / HA algorithms](./docs/design/05-reliability-ha.md)
- [6 — AI-native & agent auth ⭐](./docs/design/06-ai-native-agent-auth.md)
- [7 — UI / dashboard](./docs/design/07-ui-dashboard.md)
- [8 — Roadmap / phasing](./docs/design/08-roadmap.md)
- [9 — Verification & open questions](./docs/design/09-verification-open-questions.md)

Design inspiration: the API *feels like* [Vercel Workflows](https://workflow-sdk.dev/) and adopts its [Worlds](https://workflow-sdk.dev/worlds) abstraction. HoBo is positioned as a cloud-agnostic, AI-native alternative to closed agent-native PaaS offerings.
