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
| 7 | UI / dashboard | [`07-ui-dashboard.md`](./07-ui-dashboard.md) |
| 8 | Roadmap / phasing | [`08-roadmap.md`](./08-roadmap.md) |
| 9 | Verification, testing & open questions | [`09-verification-open-questions.md`](./09-verification-open-questions.md) |
| 10 | Reference architecture overview | [`10-architecture-overview.md`](./10-architecture-overview.md) |
| 11 | Event model, sourcing & replay | [`11-event-model.md`](./11-event-model.md) |
| 12 | Security & multi-tenancy | [`12-security-multitenancy.md`](./12-security-multitenancy.md) |
| 13 | Networking & connectivity | [`13-networking-connectivity.md`](./13-networking-connectivity.md) |
| 14 | Observability | [`14-observability.md`](./14-observability.md) |
| 15 | CLI & developer experience | [`15-cli-dx.md`](./15-cli-dx.md) |
| 16 | Cost & FinOps | [`16-cost-finops.md`](./16-cost-finops.md) |
| 17 | Positioning & competitive analysis | [`17-positioning-competitive.md`](./17-positioning-competitive.md) |
| 18 | Architecture Decision Record (ADR) log | [`18-adr-log.md`](./18-adr-log.md) |
| 19 | End-to-end worked example | [`19-worked-example.md`](./19-worked-example.md) |
| 20 | WASM/WASI runtime (the polyglot spine) | [`20-wasm-wasi-runtime.md`](./20-wasm-wasi-runtime.md) |
| 21 | Resource catalog & the `.allow()` model (Nitric parity) | [`21-resources-catalog.md`](./21-resources-catalog.md) |
| 22 | Wiring, config & the manifest IR (Aspire model) | [`22-wiring-manifest.md`](./22-wiring-manifest.md) |
| 23 | Stubbable implementations & AI implement/evolve/live-fix | [`23-stubbable-ai-implementations.md`](./23-stubbable-ai-implementations.md) |
| 24 | WIT worlds reference (the canonical ports) | [`24-wit-worlds-reference.md`](./24-wit-worlds-reference.md) |
| 25 | Resource Definitions & Matching (dynamic config mgmt, Humanitec) | [`25-resource-definitions-matching.md`](./25-resource-definitions-matching.md) |
| 26 | Environments, Deployment Sets & Deltas | [`26-environments-deltas.md`](./26-environments-deltas.md) |
| 27 | Drivers, Resource Packs & Workload Profiles | [`27-drivers-packs-profiles.md`](./27-drivers-packs-profiles.md) |
| 28 | The HoBo Agent, GitOps publisher & Pipelines | [`28-agent-gitops-pipelines.md`](./28-agent-gitops-pipelines.md) |
| — | **Phased build plan (every phase, every step)** | [`phases/`](./phases/README.md) |

**Competitor references** live in [`../../competitors/`](../../competitors/) — currently [`nitric/`](../../competitors/nitric/README.md) (full feature capture + a [HoBo parity tracker](../../competitors/nitric/hobo-mapping.md)).

**Reading order.** New to HoBo: start with [0 Vision](./00-vision.md) → [10 Architecture](./10-architecture-overview.md) → [19 Worked example](./19-worked-example.md), then the two deep plans [2 SDK](./02-sdk-api.md) and [6 AI-native/agent-auth](./06-ai-native-agent-auth.md). For the v2 runtime/authoring model read [20 WASM/WASI](./20-wasm-wasi-runtime.md) → [21 Resources/`.allow()`](./21-resources-catalog.md) → [22 Wiring/manifest](./22-wiring-manifest.md) → [23 AI implementations](./23-stubbable-ai-implementations.md). Evaluating vs alternatives: [17 Positioning](./17-positioning-competitive.md) + [`competitors/nitric`](../../competitors/nitric/README.md). Auditing decisions: [18 ADR log](./18-adr-log.md).

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
- **Planner** — the pure function that turns a Bindle + mapping into a `DeploymentPlan` DAG.
- **ResourceActor** — a controller-style grain that reconciles one resource's desired↔actual state.
- **Executor** — a Firecracker-sandboxed runner that applies IaC / builds images with short-lived scoped creds.
- **Run** — one durable execution of a workflow/agent (a `run.*` event stream).
- **Identity / SVID** — a workload identity (SPIFFE-style) issued by the Yard to agents/services for keyless auth.
- **Component** — a WASM/WASI component; the default unit a HoBo service compiles to (OCI-container fallback otherwise).
- **WIT world** — the canonical form of a HoBo **port**: a WebAssembly Interface Types contract a component imports/exports.
- **Capability provider** — a Provider as a wasm capability adapter implementing a WIT world's exports for a backend.
- **Link** — the late-bound binding from a component's imported interface to a provider's export (the `bind`/escape-hatch made concrete).
- **`.allow(...)`** — inline capability-permission on a resource; drives least-privilege IAM **+** wasm capability links **+** agent token scope.
- **IfC** — Infrastructure-from-Code: the default authoring mode where resources are declared inline and collected by running the component.
- **Manifest (IR)** — the deployment intermediate representation emitted by resource-collection and consumed by the Planner.
- **Stub** — a typed, recording placeholder behind a WIT port so an app runs before implementations exist (basis for AI implement/evolve).
- **Resource Definition** — a platform-engineer rule for *how* a port is realized in a context (provider + driver + options), selected by Matching. Mapping is sugar over default definitions.
- **Matching Criteria** — the specificity-scored selector that picks one Resource Definition for a deploy context (env-type/app/env/class/id); the decision is recorded as `match.Decided`.
- **Driver** — the execution mechanism a definition uses to realize a resource: `terraform`/`template`/`echo`/`container`/`custom-webhook`.
- **Deployment Set** — the immutable resolved config of a Camp at a point in time (the manifest IR). **Delta** — a mutable diff applied to a Set (draft→promote).
- **Environment Type** — a Camp's classification (`production`/`ephemeral`/…); the primary matching dimension.
- **Workload Profile** — how a service is realized (wasm-component/container/serverless/VM). **Resource Pack** — a shareable bundle of Resource Definitions.
- **Agent** — an outbound-only proxy inside a private network so a hosted Yard deploys there with no inbound.
