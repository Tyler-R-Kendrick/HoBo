# HoBo — Design Plan Suite

> A suite of inter-related design plans for **HoBo**, a **WIT/WASM** programmable surface (Component Model / wasmCloud) + cloud control plane — TypeScript is the first reference implementation, not a requirement ([ADR-0069](./adr/01-architecture-core.md#adr-0069)).
> This is a **planning deliverable — no HoBo *product* implementation code is committed yet** (the only code in the repo is third-party AI agent-tooling under `.agents/`/`.claude/`/`scripts/`). The design is **17 capability docs**; each plan keeps a stable `#plan-NN` anchor so areas can still be cited precisely.

## Index

Each doc is one coherent decision area; some absorb more than one plan (the folded plan keeps its `#plan-NN` anchor in the host doc).

| Doc | Covers | Plans |
|---|---|---|
| [`vision.md`](./vision.md#plan-00) | Vision, positioning & guiding principles | 00, 17 |
| [`architecture.md`](./architecture.md#plan-10) | Reference architecture + monorepo/package layout | 10 |
| [`control-plane.md`](./control-plane.md#plan-04) | The Yard control plane; providers, IaC & build/VM adapters | 04 |
| [`sdk-api.md`](./sdk-api.md#plan-02) | SDK / API design (the four-layer model) | 02 |
| [`ai-native-agent-auth.md`](./ai-native-agent-auth.md#plan-06) | AI-native platform, agent auth & end-user auth | 06 |
| [`data-plane.md`](./data-plane.md#plan-32) | Event model & the data plane: sourcing/replay, reactivity, projections, migrations, search | 11, 32 |
| [`reliability-observability-cost.md`](./reliability-observability-cost.md#plan-05) | Reliability/HA, observability & cost/FinOps | 05 |
| [`security-networking.md`](./security-networking.md#plan-12) | Security, networking & multi-tenant applications | 12, 50 |
| [`developer-experience.md`](./developer-experience.md#plan-07) | Developer experience: dashboards, CLI, status pages & availability | 07, 49 |
| [`wasm-runtime-wit.md`](./wasm-runtime-wit.md#plan-20) | WASM/WASI runtime & WIT interface reference | 20 |
| [`authoring-resources-wiring.md`](./authoring-resources-wiring.md#plan-21) | Authoring: resource catalog, wiring/manifest, config & the Hobo Code DSL | 21 |
| [`platform-engineering.md`](./platform-engineering.md#plan-25) | Platform engineering: Matching, environments, drivers/packs, Relay/GitOps/pipelines | 25 |
| [`contracts-policy-flags.md`](./contracts-policy-flags.md#plan-29) | Contracts & compatibility, the policy plane & feature flags | 29 |
| [`generated-stack.md`](./generated-stack.md#plan-23) | AI generation, the generated stack, patchability & verification/testing | 23, 09 |
| [`operators-sre.md`](./operators-sre.md#plan-40) | Operator Agents (the Crew) & SRE incident management | 40 |
| [`governance-planes.md`](./governance-planes.md#plan-46) | Governance: compliance/data governance & AI safety | 46 |
| [`worked-example.md`](./worked-example.md#plan-19) | End-to-end worked example | 19 |
| [`walkthrough.md`](./walkthrough.md) | Role-organized ideal-state walkthrough: one app, six workflows (app dev · platform eng · GitOps · SecOps · DevOps · SRE) | — |

**Decisions** live as 4 thematic ADR docs in [`adr/`](./adr/README.md) (each decision is a `#adr-NNNN` section).

**Archived planning material** (not part of the current design state — revived when the work is scoped): the **roadmap / build sequence** and the formal **requirements suite** (BRD/PRD/TRD + BR→FR/NFR→TR traceability) live in [`../../archive/`](../../archive/). The design-relevant scope boundary and NFR/SLO targets are kept in the design itself ([ADR-0063](./adr/07-portability-extensibility.md#adr-0063)/[ADR-0064](./adr/07-portability-extensibility.md#adr-0064)/[ADR-0021](./adr/07-portability-extensibility.md#adr-0021)).

**Competitor references** live in [`../../competitors/`](../../competitors/).

**Scope.** The whole suite is **one scope** — every plan is in scope, bounded only by the AI-native-meta-cloud-minus-monetization line ([ADR-0063](./adr/07-portability-extensibility.md#adr-0063)/[ADR-0064](./adr/07-portability-extensibility.md#adr-0064)). Build sequencing/phasing is deferred planning (archived).

**Reading order.** New to HoBo: [Vision](./vision.md#plan-00) → [Architecture](./architecture.md#plan-10) → [Worked example](./worked-example.md#plan-19), then the two deep plans [SDK](./sdk-api.md#plan-02) and [AI-native/agent-auth](./ai-native-agent-auth.md#plan-06). Want it by role: the [Walkthrough](./walkthrough.md) takes one app through six clean workflows — app developer, platform engineer, GitOps, SecOps, DevOps, and SRE — each with its own loop and one shared verb (`hobo up`). Runtime/authoring model: [WASM/WASI](./wasm-runtime-wit.md#plan-20) → [Resources/`.allow()`/wiring](./authoring-resources-wiring.md#plan-21) → [AI implementations](./generated-stack.md#plan-23). Evaluating vs alternatives: [Positioning](./vision.md#plan-17) + [`competitors/`](../../competitors/). Auditing decisions: the [ADR docs](./adr/README.md).

---

## Context

**Problem.** Shipping software still forces application developers to become part-time platform engineers: picking clouds, wiring IaC, designing for HA, and operating infra. Tools today force a bad trade — either an opinionated closed PaaS (simple but locked-in, e.g. **Lakebed**) or raw multi-cloud IaC (powerful but heavy). Neither is built for the world that's coming, where **AI agents are the primary builders and deployers**.

**What HoBo is.** An *intermediary cloud control plane* with a developer-centric, cloud-agnostic programmable surface that is **WIT/WASM** (the Component Model / wasmCloud) — **TypeScript is the first reference implementation, not a requirement**; any Component-Model language authors against the same WIT interfaces ([ADR-0069](./adr/01-architecture-core.md#adr-0069)). Developers describe their app once through **PaaS / SaaS / CaaS / IaaS abstractions**; a **provider pattern** (ports & adapters) maps those abstractions onto real providers. You can map the whole app to a single provider ("just host this on Azure, figure it out"), split tiers across providers, or pin specific boundaries to specific providers — and drop to typed **provider-specific options** when you want to optimize. IaC tools (Pulumi, Crossplane, Terraform/OpenTofu) and image/VM tools (Dagger, Packer, Vagrant, Firecracker) are themselves pluggable via the same ports/adapters pattern.

**Why it wins.** Write cloud-agnostic code that ships anywhere; reach for provider-native power only when you want to. The API *feels like* [Vercel Workflows](https://workflow-sdk.dev/) for its durable `workflow`/`step` ergonomics, but the durable runtime is **HoBo-native and provided per [Camp](#glossary--naming-thematic-all-tunable)** (no dependency on any single vendor's runtime). The whole system is **AI-native**: actor-model + choreography sagas over a replayable event store, agents as first-class authenticated users, a machine-readable **auth/capability standard** so agents self-provision credentials with zero developer effort, and AI-generated provider plugins instead of relying on a community to write them.

**Intended outcome.** A self-hostable (or hosted) **hobo-cloud** orchestrator + an SDK such that a developer (or an agent) can `hobo deploy` an app and have it land on real infrastructure — agnostic by default, optimizable on demand.

### Competitive frame vs Lakebed (what we deliberately do differently)
| Dimension | Lakebed | HoBo |
|---|---|---|
| Unit of deploy | "Capsule" (one full-stack TS app on their runtime) | **Bindle** (app topology mapped to *any* provider mix) |
| Cloud model | Single closed hosted runtime | **Cloud-agnostic** ports/adapters, multi-provider, self-hostable |
| IaC | Hidden, none exposed | Pluggable **IaC providers** (Pulumi/Crossplane/Terraform/OpenTofu) |
| Runtime model | Synchronous RPC (queries/mutations) | **Actors + durable workflows + choreography sagas** over a replayable event store |
| Agents | Agent-readable contracts; basic guest/Google auth | **Agents as first-class authenticated principals**; auto-token issuance via a capability standard; durable AI agents; MCP control surface |
| Extensibility | Community / first-party | **AI-generated provider plugins** gated by conformance tests |

---

## Glossary & naming (thematic, all tunable)

HoBo's metaphor is the itinerant worker who travels light. Names are proposals; technical meaning is what matters. This is the foundational vocabulary — each subsystem's full treatment is in its capability doc and ADRs.

> **One word, several senses (read once).** A few terms are deliberately reused — disambiguated here so prose elsewhere can stay terse:
> - **runtime** — the SDK **primitives** package (`@hobo/runtime`) · the **`Runtime` interface** (the five durable ports a Camp provides) · a **`runtime-*` backend** that implements them.
> - **port** — a **runtime substrate port** (EventStore/Queue/Streamer/ActorHost/Clock) · an **infra port** (cloud/IaC/build) · a **capability WIT port** (`wasi:*`/`hobo:*`). All three are "ports/adapters"; the tier is clear from context.
> - **environment** — an **env-type** (a Camp's `production`/`ephemeral` matching dimension) · an **env-group** (the member Camps of one logical environment, possibly cross-cloud) · the **environment rollup axis** (project × environment in dashboards). Not a config layer.
> - **mock** — a **boundary mode** (ADR-0076, a contract-served fake) · a **fidelity label** (ADR-0042, an honest local seam) · a **contract mode**. The fidelity label is the one that gates prod-readiness claims.
> - **the Yard** — the **per-provider scope** (one provider's Camps + cross-Camp policy) **and** the **control plane** that runs it; the **Orchestrator** is the control-plane component. Same noun, scope-and-its-software.

**Scope chain & deployment nouns**
- **Layered scopes** — config nests **`Junction` ⊃ `Yard` ⊃ `Camp` ⊃ `Bindle`** ([ADR-0026](./adr/01-architecture-core.md#adr-0026)): *connected-across-clouds* ⊃ *governed-per-provider* ⊃ *where-on-which-provider* ⊃ *what-the-app-is*. This is the **infra-containment** axis; **project** and **app-tenant** are separate ownership/rollup axes, not scope nouns.
- **Bindle** — app-level config: an app's declared topology + bindings, provider-agnostic. Deployed *into* Camps.
- **Camp** — a provider-specific deployment target (`<env>-<provider>`); independently selects a **runtime backend** and an infra **Provider**. A Bindle deploys to one or more Camps.
- **The Yard** — the control plane / orchestrator **and** the provider-specific cross-Camp scope: one Yard groups the Camps under **one provider** and runs that provider's control plane.
- **Junction** — the cross-cloud / hybrid scope ([ADR-0043](./adr/07-portability-extensibility.md#adr-0043)): it **federates** identity trust + signed policy packs + signed registry bundles across autonomous Yards — a peer connector, **not** a controller or shared state.
- **Environment group** — the member Camps of one logical environment (e.g. `production` = {`prod-aws`,`prod-azure`}); promote/rollback across them is a **saga** ([ADR-0028](./adr/01-architecture-core.md#adr-0028)). An orchestration grouping, not a config layer.
- **Project / Environment (rollup axes)** — two grouping axes that **cross-cut** the scope chain ([ADR-0077](./adr/02-identity-security.md#adr-0077)): a Project spans many Bindles/Camps/Yards (recorded on events like `tenant`, not a containment noun); an Environment is the env-group as a filter axis. The operational grid is **project × environment**.

**Runtime & ports**
- **Runtime ports** — the durable-runtime capability ports a Camp provides: EventStore + Queue + Streamer + ActorHost + Clock. Backends are pluggable (`runtime-local` built-in; `runtime-postgres`/`-temporal`/`-restate`/`-cloudflare`).
- **Provider** — an adapter implementing infra **ports** (cloud / IaC / build/VM) for a backend. **Port** — a capability interface providers implement. **Capability provider** — a Provider as a wasm capability adapter implementing a WIT interface.
- **Component** — a WASM/WASI component; the default unit a HoBo service compiles to (OCI-container fallback). **WIT interface** — the canonical form of a HoBo port. **`component-host`** — the port that executes components, a property of a Camp ([ADR-0031](./adr/01-architecture-core.md#adr-0031)); Wasmtime locally, wasm-in-container the v1 prod default.
- **Capability Manifest** — the machine-readable auth + capability standard: a provider publishes a manifest describing what it offers and how an agent obtains a token.

**Authoring**
- **IfC** — Infrastructure-from-Code: resources declared inline, collected by running the component. **Manifest (IR)** — the deployment intermediate representation the Planner consumes.
- **`.allow(...)`** — inline capability-permission driving least-privilege IAM + wasm capability links + agent token scope.
- **Stub** — a typed, recording placeholder behind a WIT port so an app runs before implementations exist (basis for AI implement/evolve).
- **Hobo Code** *(future)* — the planned HoBo config + code DSL, designed to be optimal for AI generation; compiles to the same Manifest IR + SDK constructs ([Plan 21](./authoring-resources-wiring.md#plan-21)). **WIT-first SDK** — the SDK is provided *through* WIT ([ADR-0072](./adr/01-architecture-core.md#adr-0072)); each language SDK = `wit-bindgen` bindings + a thin idiom layer; codegen is deterministic ([ADR-0037](./adr/01-architecture-core.md#adr-0037)).
- **Config & secrets (secretless-first)** — apps read config/secrets via `ctx.config`; values resolve to **references per Camp**, never literals, preferring workload identity (SVID) → brokered short-lived tokens ([ADR-0023](./adr/02-identity-security.md#adr-0023)).

**Control plane**
- **Planner** — the pure function turning a Bindle + mapping into a `DeploymentPlan` DAG. **ResourceActor** — a controller-style grain reconciling one resource's desired↔actual state. **Executor** — a Firecracker-sandboxed runner applying IaC / building images with short-lived scoped creds. **Grain** — a virtual actor (the default concurrency primitive).
- **Run** — one durable execution of a workflow/agent (a `run.*` event stream). **Identity / SVID** — a SPIFFE-style workload identity issued by the Yard for keyless auth.
- **generation pipeline** — the AI pipeline that generates & certifies new Provider plugins (and implementations, Resource Definitions): scaffold → LLM-fill → validate(sandboxed) → repair(via the `training-engine`) → certify(sign + provenance), gated by `@hobo/conformance` ([Plan 23](./generated-stack.md#plan-23)/[ADR-0010](./adr/03-data-plane.md#adr-0010)). **`"use training"`** — SDK directive marking an **AI-rewritable semantic function**, continuously optimized against a rubric behind the `training-engine` port ([ADR-0025](./adr/03-data-plane.md#adr-0025)).
- **Relay** — an outbound-only proxy inside a private network so a hosted Yard deploys there with no inbound ([Plan 25](./platform-engineering.md#plan-25)). "Agent" is reserved for autonomous principals; the proxy is the Relay.

**Platform engineering**
- **Resource Definition** — a platform-engineer rule for how a port is realized in a context (provider + driver + options). **Matching Criteria** — the **deterministic, replayable** selector picking one Definition (filter on hard `require`, then rank lexicographically — specificity → `priority` → objective → tiebreak; recorded in `match.Decided`, [ADR-0033](./adr/01-architecture-core.md#adr-0033)). **Planner objective** — the soft ranking tiebreak (`cost`|`latency`|`single-provider`|`carbon`|`maximize-credits`, default min-cost). **The Dispatcher** — the same selector applied credit/budget-aware at placement/dispatch/traffic ([ADR-0071](./adr/01-architecture-core.md#adr-0071)).
- **Driver** — the execution mechanism a definition uses (`terraform`/`template`/`echo`/`container`/`custom-webhook`). **Resource Pack** — a shareable bundle of Resource Definitions. **Workload Profile** — how a service is realized (wasm-component/container/serverless/VM).
- **Deployment Set** — the immutable resolved config of a Camp (the manifest IR). **Delta** — a mutable diff applied to a Set (draft→promote). **Environment Type** — an environment classification (`production`/`ephemeral`/…), the primary matching dimension.

**Cross-cutting models**
- **Event model** — the durable substrate ([Plan 11](./data-plane.md#plan-11)): every fact is an `EventEnvelope`; aggregates/projections fold the log; replay==live is a hard invariant; HoBo speaks **CloudEvents/OCSF/OTLP** at the boundary ([ADR-0046](./adr/02-identity-security.md#adr-0046)).
- **Four-lens taxonomy** — **Contract** = must never break · **Eval** = should improve · **Policy** = may/may not be allowed · **Trace** = what actually happened.
- **Contract / `can-deploy`** — a typed expectation on a graph edge (declared/inferred/observed/promoted) and the compatibility-matrix gate checking a change against versions running per environment ([Plan 29](./contracts-policy-flags.md#plan-29)). **Policy decision / Obligation** — `{ effect, obligations, evidence }`; an Obligation = "allow but require X" realized as a durable HoBo effect/saga. **Gatekeeper** — the composite gate (contracts + policy + evals + conformance + cost) behind `hobo verify`.
- **Projection / Projection Sink** — app domain data is **event-sourced by default**; a **projection is a subscribable materialization** (fold over the log → a WIT-record read model). A **sink** is an optional queryable cache materialized into an architect-chosen backend via Matching; the log, not the sink, is authoritative ([ADR-0050](./adr/03-data-plane.md#adr-0050)/[ADR-0052](./adr/03-data-plane.md#adr-0052)). **`command`/`subscribe`/`repo`/`view`** — the data-access surface: write = `command`→`ctx.emit`; default read = `subscribe`(live); escape hatches = `repo`/`view`/`.raw()`. **Aggregate** — the write-model consistency boundary, realized as an actor ([ADR-0053](./adr/03-data-plane.md#adr-0053)).
- **Operator Agents (the Crew)** — built-in autonomous Yard services (SRE · Endpoint Monitor · GitOps · Platform Engineer · UX Designer · SWE), each a named principal, event-sourced, MCP-surfaced, sandboxed under enforced AI governance ([Plan 40](./operators-sre.md#plan-40)/[ADR-0054](./adr/03-data-plane.md#adr-0054)).
- **The generated stack / Patchability** — HoBo AI-generates, self-heals, and persists the app across data/business/message/intelligence/UI layers ([ADR-0055](./adr/03-data-plane.md#adr-0055)); **patchability** ([ADR-0057](./adr/07-portability-extensibility.md#adr-0057)) is the promise *beyond* portability — derive/extend/patch HoBo itself behind the same ports + conformance. *Portability = the same app runs on N backends; patchability = you can derive your own HoBo and keep it.*
- **The `notify` port (`hobo:notify`)** — the one canonical cloud-messaging transport ([ADR-0059](./adr/03-data-plane.md#adr-0059)/[ADR-0045](./adr/02-identity-security.md#adr-0045)): `email`/`sms`/`push`/`webhookOut` behind one secretless-brokered port; ops alerting, app comms, status delivery and on-call paging are consumers of the same port.
- **Org governance** — enterprises lock down HoBo's **own** control-plane surface ([ADR-0074](./adr/02-identity-security.md#adr-0074)): a `hobo:*` admin action taxonomy makes every control-plane action a deny-by-default, role-gated, audited decision; **mandatory policy rules (deny-ceilings)** at the Yard/Junction can only be further-restricted by lower scopes.
- **Golden Suites & A2H** — "well-tested by default" as a reproducible property for **every deployment** — HoBo's own infra *and* the customer's apps, infra & agents ([ADR-0082](./adr/02-identity-security.md#adr-0082)). A **Golden Suite** is a signed, versioned bundle that pins + orchestrates the existing checks (conformance + contracts + evals + benchmarks + chaos + SLO) plus a **golden-master primitive** (`golden.sample`: bless a reference output, then assert reproduction); the default suite is auto-derived, runs as a `can-deploy` gate dimension + continuously against a replay/fork lane, and is disable/extensible per scope (a deny-ceiling can keep it mandatory in prod). Failure opens an **Incident** → the Crew decision tree (auto-fix → propose → escalate); a `requiresHuman` case goes straight to **A2H** (agent-to-human handoff: a typed package over `hobo:notify` + on-call as a deadline obligation, decision = apply-fix / re-bless / abort, event-sourced).
- **The Harness (progressive delivery)** — HoBo's **delivery core** ([ADR-0083](./adr/02-identity-security.md#adr-0083)): the deploy gate decides *whether* to ship, the Harness decides *how it rolls out*, through three pluggable standard-shaped ports over **OpenTelemetry** — **OpenFeature** (`hobo:feature-flag`, real CNCF standard; flagd/LaunchDarkly) · **OpenDelivery** (`hobo:delivery`; canary/blue-green/rollouts/promotion + Flagger-style **automated rollback**; HoBo's built-in [Plan 5](./reliability-observability-cost.md#plan-05) default, adapters Argo Rollouts/Flagger/Spinnaker) · **OpenExperiment** (`hobo:experiment`; assignment/exposure/metrics/stats; adapters Statsig/GrowthBook/Optimizely/Eppo). The loop: deploy dark → ramp the flag → shift canary traffic → watch SLO+metrics → auto-rollback or promote → conclude an experiment. *OpenFeature/OTEL are real standards; OpenDelivery/OpenExperiment are HoBo-shaped ports (no standard yet — CDEvents at the boundary). The built-in engines are per-Camp swaps; the core **pattern** changes only if the industry's dominant release pattern does.*
