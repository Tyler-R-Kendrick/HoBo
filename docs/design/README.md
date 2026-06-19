# HoBo — Design Plan Suite

> A suite of inter-related design plans for **HoBo**, a TypeScript SDK + cloud control plane.
> This is a **planning deliverable only — no implementation code is committed yet.** Each numbered plan lives in its own file so we can iterate on areas independently.

## Index

| # | Plan | File |
|---|------|------|
| 0 | Vision, positioning & guiding principles | [`00-vision.md`](./00-vision.md) |
| 1 | Monorepo & package architecture | [`01-monorepo.md`](./01-monorepo.md) |
| 2 | SDK / API design ⭐ (deep) | [`02-sdk-api.md`](./02-sdk-api.md) |
| 3 | Providers, IaC & build/VM adapters | [`03-providers-iac.md`](./03-providers-iac.md) |
| 4 | The Yard (hobo-cloud control plane) | [`04-control-plane.md`](./04-control-plane.md) |
| 5 | Reliability / HA algorithms | [`05-reliability-ha.md`](./05-reliability-ha.md) |
| 6 | AI-native & agent auth ⭐ (deep) | [`06-ai-native-agent-auth.md`](./06-ai-native-agent-auth.md) |
| 7 | UI / dashboard (sketch) | [`07-ui-dashboard.md`](./07-ui-dashboard.md) |
| 8 | Roadmap / phasing | [`08-roadmap.md`](./08-roadmap.md) |
| 9 | Verification & open questions | [`09-verification-open-questions.md`](./09-verification-open-questions.md) |

---

## Context

**Problem.** Shipping software still forces application developers to become part-time platform engineers: picking clouds, wiring IaC, designing for HA, and operating infra. Tools today force a bad trade — either an opinionated closed PaaS (simple but locked-in, e.g. **Lakebed**) or raw multi-cloud IaC (powerful but heavy). Neither is built for the world that's coming, where **AI agents are the primary builders and deployers**.

**What HoBo is.** An *intermediary cloud control plane* with a developer-centric, cloud-agnostic TypeScript SDK. Developers describe their app once through **PaaS / SaaS / CaaS / IaaS abstractions**; a **provider pattern** (ports & adapters) maps those abstractions onto real providers. You can map the whole app to a single provider ("just host this on Azure, figure it out"), split tiers across providers, or pin specific boundaries to specific providers — and drop to typed **provider-specific options** when you want to optimize. IaC tools (Pulumi, Crossplane, Terraform/OpenTofu) and image/VM tools (Dagger, Packer, Vagrant, Firecracker) are themselves pluggable via the same ports/adapters pattern.

**Why it wins.** Write cloud-agnostic code that ships anywhere; reach for provider-native power only when you want to. The API *feels like* [Vercel Workflows](https://workflow-sdk.dev/) and adopts its [**Worlds**](https://workflow-sdk.dev/worlds) abstraction for a portable, durable runtime. The whole system is **AI-native**: actor-model + choreography sagas over a replayable event store, agents as first-class authenticated users, a machine-readable **auth/capability standard** so agents self-provision credentials with zero developer effort, and AI-generated provider plugins instead of relying on a community to write them.

**Intended outcome.** A self-hostable (or hosted) **hobo-cloud** orchestrator + an SDK such that a developer (or an agent) can `hobo deploy` a TypeScript app and have it land on real infrastructure — agnostic by default, optimizable on demand.

### Decisions locked (from clarifying Q&A)
1. **Substrate:** TS-native control-plane core (actor runtime + Pulumi Automation API to drive IaC); Kubernetes/Crossplane is *one optional* execution adapter, not the foundation.
2. **Durable core:** HoBo defines its own *Worlds*-style ports (EventStore + Queue + Streamer + ActorHost + Clock) and ships a **built-in lightweight engine**, plus adapters for Temporal / Restate / DBOS / Cloudflare DO.
3. **SDK feel:** **Layered blend** — topology/resource layer + provider mapping + actor runtime + Vercel-style `workflow`/`step`/`agent` primitives + provider-specific options escape hatch.
4. **Deepest in this round:** **SDK/API design** and **AI-native + agent auth**. Architecture overview and a UI sketch are included; control-plane internals and providers are at solid (not maximal) depth and flagged for later iteration.

### Competitive frame vs Lakebed (what we deliberately do differently)
| Dimension | Lakebed | HoBo |
|---|---|---|
| Unit of deploy | "Capsule" (one full-stack TS app on their runtime) | **Bindle** (app topology mapped to *any* provider mix) |
| Cloud model | Single closed hosted runtime | **Cloud-agnostic** ports/adapters, multi-provider, self-hostable |
| IaC | Hidden, none exposed | Pluggable **IaC providers** (Pulumi/Crossplane/Terraform/OpenTofu) |
| Runtime model | Synchronous RPC (queries/mutations) | **Actors + durable workflows + choreography sagas** over a replayable event store |
| Agents | Agent-readable contracts; basic guest/Google auth | **Agents as first-class authenticated principals**; auto-token issuance via a capability standard; durable AI agents; MCP control surface |
| Extensibility | Community / first-party | **AI-generated provider plugins** gated by conformance tests |

> Lakebed's strengths we should match: ruthless simplicity, machine-readable contracts (`llms.txt`/`llms-full.txt`, `docs.json`), instant `npx` onboarding, server-authority. HoBo must not become "powerful but unusable."

---

## Glossary & naming (thematic, all tunable)

HoBo's metaphor is the itinerant worker who travels light and shares a standardized sign language. Names below are proposals; technical meaning is what matters.

- **Bindle** — the deployable unit: an app's declared topology + bindings. (Lakebed "capsule" analog.)
- **Camp** — an environment a bindle runs in (dev / preview / staging / prod).
- **World** — the durable-runtime backing (ports: EventStore + Queue + Streamer + ActorHost + Clock). Adopted from Vercel. Selected per Camp.
- **Provider** — an adapter that implements infra **ports** (cloud / IaC / build/VM) for a specific backend.
- **Port** — a capability interface (e.g. `Database`, `Compute`, `ObjectStore`, `Vm`) that providers implement.
- **Hobo Code / Signs** — the machine-readable **auth + capability standard** (the `auth.md` analog). Providers publish "signs" describing what they offer and how an agent obtains a token. The thematic anchor: hobo signs were a real standardized symbol language for finding resources & safe routes — exactly what agents need.
- **The Yard** — hobo-cloud: the control plane / orchestrator (rail-yard where bindles are routed to real hosting).
- **Forge** — the AI pipeline that generates & certifies new Provider plugins.
- **Grain** — a virtual actor (Orleans term, kept for familiarity); the default concurrency primitive.
