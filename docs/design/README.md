# HoBo — Design Plan Suite

> A suite of inter-related design plans for **HoBo**, a TypeScript SDK + cloud control plane.
> This is a **planning deliverable — no HoBo *product* implementation code is committed yet** (the only code in the repo is third-party AI agent-tooling under `.agents/`/`.claude/`/`scripts/`). Each numbered plan lives in its own file so we can iterate on areas independently.

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
| 18 | Architecture Decision Record (ADR) log | [`18-adr-log.md`](./18-adr-log.md) · per-file ADRs in [`adr/`](./adr/README.md) |
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
| 29 | Contracts & compatibility (the `can-deploy` gate) | [`29-contracts-compatibility.md`](./29-contracts-compatibility.md) |
| 30 | The policy plane (decisions, obligations & gates) | [`30-policy-plane.md`](./30-policy-plane.md) |
| 31 | Configuration & secretless secrets | [`31-config-secretless-secrets.md`](./31-config-secretless-secrets.md) |
| 32 | Reactive / live queries (the reactor) | [`32-reactive-live-queries.md`](./32-reactive-live-queries.md) |
| — | **Phased build plan (every phase, every step)** | [`phases/`](./phases/README.md) |

**Requirements suite** (BRD / PRD / TRD + the requirements decision log) lives in [`../requirements/`](../requirements/README.md) — the *why / what / how-in-requirements-terms* layer over these design plans, with end-to-end BR→FR/NFR→TR traceability.

**Competitor references** live in [`../../competitors/`](../../competitors/) — currently [`nitric/`](../../competitors/nitric/README.md) (full feature capture + a [HoBo parity tracker](../../competitors/nitric/hobo-mapping.md)).

**Reading order.** New to HoBo: start with [0 Vision](./00-vision.md) → [10 Architecture](./10-architecture-overview.md) → [19 Worked example](./19-worked-example.md), then the two deep plans [2 SDK](./02-sdk-api.md) and [6 AI-native/agent-auth](./06-ai-native-agent-auth.md). For the v2 runtime/authoring model read [20 WASM/WASI](./20-wasm-wasi-runtime.md) → [21 Resources/`.allow()`](./21-resources-catalog.md) → [22 Wiring/manifest](./22-wiring-manifest.md) → [23 AI implementations](./23-stubbable-ai-implementations.md). Evaluating vs alternatives: [17 Positioning](./17-positioning-competitive.md) + [`competitors/nitric`](../../competitors/nitric/README.md). Auditing decisions: [18 ADR log](./18-adr-log.md).

---

## Context

**Problem.** Shipping software still forces application developers to become part-time platform engineers: picking clouds, wiring IaC, designing for HA, and operating infra. Tools today force a bad trade — either an opinionated closed PaaS (simple but locked-in, e.g. **Lakebed**) or raw multi-cloud IaC (powerful but heavy). Neither is built for the world that's coming, where **AI agents are the primary builders and deployers**.

**What HoBo is.** An *intermediary cloud control plane* with a developer-centric, cloud-agnostic TypeScript SDK. Developers describe their app once through **PaaS / SaaS / CaaS / IaaS abstractions**; a **provider pattern** (ports & adapters) maps those abstractions onto real providers. You can map the whole app to a single provider ("just host this on Azure, figure it out"), split tiers across providers, or pin specific boundaries to specific providers — and drop to typed **provider-specific options** when you want to optimize. IaC tools (Pulumi, Crossplane, Terraform/OpenTofu) and image/VM tools (Dagger, Packer, Vagrant, Firecracker) are themselves pluggable via the same ports/adapters pattern.

**Why it wins.** Write cloud-agnostic code that ships anywhere; reach for provider-native power only when you want to. The API *feels like* [Vercel Workflows](https://workflow-sdk.dev/) for its durable `workflow`/`step` ergonomics, but the durable runtime is **HoBo-native and provided per [Camp](#glossary--naming-thematic-all-tunable)** (no dependency on any single vendor's runtime). The whole system is **AI-native**: actor-model + choreography sagas over a replayable event store, agents as first-class authenticated users, a machine-readable **auth/capability standard** so agents self-provision credentials with zero developer effort, and AI-generated provider plugins instead of relying on a community to write them.

**Intended outcome.** A self-hostable (or hosted) **hobo-cloud** orchestrator + an SDK such that a developer (or an agent) can `hobo deploy` a TypeScript app and have it land on real infrastructure — agnostic by default, optimizable on demand.

### Decisions locked (from clarifying Q&A)
1. **Substrate:** TS-native control-plane core (actor runtime + Pulumi Automation API to drive IaC); Kubernetes/Crossplane is *one optional* execution adapter, not the foundation.
2. **Durable core:** HoBo defines its own **runtime ports** (EventStore + Queue + Streamer + ActorHost + Clock) — the durable runtime a **Camp** provides — and ships a **built-in lightweight engine** (`runtime-local`), plus backends for Temporal / Restate / DBOS / Cloudflare DO. *(This is HoBo-native; it deliberately does **not** adopt Vercel's "World" concept.)*
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

- **Layered scopes** — HoBo config nests in three scopes: **`Yard` ⊃ `Camp` ⊃ `Bindle`** — *governed-how-across-clouds* (cross-provider policy + control plane) ⊃ *where-on-which-provider* (a provider-specific target + its runtime) ⊃ *what-the-app-is* (app config).
- **Bindle** — **app-level config**: an app's declared topology + bindings, provider-agnostic. (Lakebed "capsule" analog.) Deployed *into* Camps.
- **Camp** — a **provider-specific deployment target**; canonical id `<env>-<provider>` (e.g. `prod-aws`). A Camp **independently selects** a **runtime backend** (the runtime ports below) **and** an infra **Provider** — they can be different vendors (e.g. `provider-aws` + a Temporal runtime). A **Bindle deploys to one *or more* Camps**; a multi-cloud `production` is several Camps under one Yard, wired by the Yard ([ADR-0028](./adr/ADR-0028-multi-camp-deployment-model.md)). The local dev Camp ships a built-in runtime (`runtime-local`). Belongs to a Yard.
- **Environment group** — the member Camps of one logical environment (e.g. `production` = {`prod-aws`,`prod-azure`}); `hobo … --env production` promotes/rolls-back across them as a **Yard saga** (`env.*` events) over the per-Camp Sets. An orchestration grouping, **not** a 4th config layer ([ADR-0028](./adr/ADR-0028-multi-camp-deployment-model.md)).
- **Runtime ports** — the durable-runtime capability ports a **Camp** provides: EventStore + Queue + Streamer + ActorHost + Clock. Backends are pluggable (`runtime-local` built-in; `runtime-postgres` / `-temporal` / `-restate` / `-cloudflare`). *Replaces the earlier vendor-branded "World"; the substrate is now a property of a Camp.* **Disambiguation — three senses of "runtime":** `@hobo/runtime` = the SDK **primitives** package (`workflow`/`step`/`actor`/…); the **`Runtime` interface** (`@hobo/core`) = the five ports a backend implements; **`runtime-*`** = the **backends** that implement them.
- **Provider** — an adapter that implements infra **ports** (cloud / IaC / build/VM) for a specific backend.
- **Port** — a capability interface (e.g. `Database`, `Compute`, `ObjectStore`, `Vm`) that providers implement.
- **Hobo Code / Signs** — the machine-readable **auth + capability standard** (the `auth.md` analog). Providers publish "signs" describing what they offer and how an agent obtains a token. The thematic anchor: hobo signs were a real standardized symbol language for finding resources & safe routes — exactly what agents need.
- **The Yard** — hobo-cloud: the control plane / orchestrator **and the broadest scope** — it holds **cross-provider / cross-cloud / hybrid** policy + topology and governs many **Camps** (`Yard ⊃ Camp ⊃ Bindle`). A rail-yard where bindles are routed across providers to real hosting. A multi-cloud `production` is several Camps under one Yard.
- **Config & secrets (secretless-first)** — apps read config/secrets via `ctx.config`; values resolve to **references per Camp**, never literals in the Bindle / Camp config / event log. Resolution prefers workload identity (SVID) → brokered short-lived tokens / OIDC federation ([Plan 6](./06-ai-native-agent-auth.md)/[Plan 12](./12-security-multitenancy.md)/[Plan 31](./31-config-secretless-secrets.md)); static secrets are a bounded, audited, opt-in fallback ([ADR-0023](./adr/ADR-0023-security-posture-commitments.md)).
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
- **Environment Type** — an environment classification (`production`/`ephemeral`/…) a Camp carries; the primary matching dimension. *Not a separate layer:* a multi-cloud `production` spans several Camps under one Yard.
- **Workload Profile** — how a service is realized (wasm-component/container/serverless/VM). **Resource Pack** — a shareable bundle of Resource Definitions.
- **Agent** — an outbound-only proxy inside a private network so a hosted Yard deploys there with no inbound.
- **Four-lens taxonomy** — **Contract** = must never break · **Eval** = should improve · **Policy** = may/may not be allowed · **Trace** = what actually happened.
- **Contract** — a typed expectation on a graph edge (HTTP/event/binding/`.allow()` scope/SLO/semantic/agent-tool), in mode *declared/inferred/observed/promoted*. **`can-deploy`** — the compatibility-matrix gate checking a change against versions already running per environment.
- **Policy decision** — `{ effect: allow/deny/warn/mutate/require-approval, obligations, evidence }`; an **Obligation** = "allow but require X" realized as a durable HoBo effect/saga.
- **Eval / rubric** — scored quality thresholds (with champion/challenger + shadow traffic) gating an AI-impl promotion. **Gatekeeper** — the composite gate (contracts + policy + evals + conformance + cost) behind `hobo verify`.
- **`"use training"`** — SDK directive (peer to `"use workflow"`/`"use step"`) marking a method an **AI-rewritable semantic function**; HoBo continuously optimizes its prompt/code against a rubric ([Plan 23](./23-stubbable-ai-implementations.md)/[Plan 2](./02-sdk-api.md)). **Training-engine** — the WIT port the optimizer sits behind (built-in default; Microsoft Agent Lightning / Trace as optional *internal* providers, never on the SDK surface).
- **Trajectory** — one trainable-method invocation captured as an **OpenInference** (OTel-native AI-span convention) span tree + I/O + the **reward** from live-evals; the unit the training-engine learns from. **Live-eval** — a rubric scored continuously on live/shadow traffic, supplying both the training reward signal and performance telemetry.
- **`query()` / `"use query"`** — a deterministic, read-only SDK primitive/directive (peer to `"use workflow"`/`"use step"`) for a **reactive query**; the runtime tracks its **read-set** and re-pushes results to clients on change ([Plan 32](./32-reactive-live-queries.md)). Client surface: `useQuery()`. **Reactor (`QueryReactor`)** — the data-plane grain that recomputes a subscribed query at a new monotonic `seq` and pushes the result/delta over the `Streamer` + gateway. **Read-set** — the streams/projections/change-feed topics a query touched, re-tracked each recompute. **Change-feed capability** — an opt-in `database`-port capability ([Plan 21](./21-resources-catalog.md)/[Plan 24](./24-wit-worlds-reference.md)) that normalizes a provider DB's change stream into `data.Changed` events so DB-backed queries are reactive too. Consistency: **per-query consistent snapshot @ `seq`** + reads-your-writes ([ADR-0029](./adr/ADR-0029-reactive-live-query-model.md)).
