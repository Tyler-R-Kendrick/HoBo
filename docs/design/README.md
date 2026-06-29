# HoBo — Design Plan Suite

> A suite of inter-related design plans for **HoBo**, a **WIT/WASM** programmable surface (Component Model / wasmCloud) + cloud control plane — TypeScript is the first reference implementation, not a requirement ([ADR-0069](./adr/01-architecture-core.md#adr-0069)).
> This is a **design-first repository, not a shipped HoBo product**. It now includes executable draft proof/contract packages under `src/draft/` plus validation scripts; those packages prove design claims and backlog slices before production implementation. The design is **17 capability docs** plus contract records; each plan keeps a stable `#plan-NN` anchor so areas can still be cited precisely.

## Index

Each capability doc is one coherent decision area; some absorb more than one plan (the folded plan keeps its `#plan-NN` anchor in the host doc). Contract records pin public surfaces that cross multiple capability docs.

| Doc | Covers | Plans |
|---|---|---|
| [`vision.md`](./vision.md#plan-00) | Vision, positioning & guiding principles | 00, 17 |
| [`architecture.md`](./architecture.md#plan-10) | Reference architecture + monorepo/package layout | 10 |
| [`control-plane.md`](./control-plane.md#plan-04) | The Yard control plane; providers, IaC & build/VM adapters | 04 |
| [`sdk-api.md`](./sdk-api.md#plan-02) | SDK / API design (the four-layer model) | 02 |
| [`sdk-contracts.md`](./sdk-contracts.md) | Canonical public SDK signatures, defaults, conformance coverage, and implementation issue mapping | 02, 21 |
| [`package-namespaces.md`](./package-namespaces.md) | Canonical package/import ownership for `@hobo/*` namespaces | 02, 10, 21 |
| [`ai-native-agent-auth.md`](./ai-native-agent-auth.md#plan-06) | AI-native platform, agent auth & end-user auth | 06 |
| [`data-plane.md`](./data-plane.md#plan-32) | Event model & the data plane: sourcing/replay, reactivity, projections, migrations, search | 11, 32 |
| [`reliability-observability-cost.md`](./reliability-observability-cost.md#plan-05) | Reliability/HA, observability & cost/FinOps | 05 |
| [`security-networking.md`](./security-networking.md#plan-12) | Security, networking & multi-tenant applications | 12, 50 |
| [`developer-experience.md`](./developer-experience.md#plan-07) | Developer experience: dashboards, CLI, status pages & availability | 07, 49 |
| [`cli-spec.md`](./cli-spec.md) | Canonical CLI verb surface + lifecycle semantics | — |
| [`plan-diff-viewer.md`](./plan-diff-viewer.md) | Productization M0 scope and acceptance for Plan/Diff Viewer | — |
| [`pre-launch-outcome-contract.md`](./pre-launch-outcome-contract.md) | Productization M0 contract for pre-launch outcome baselines and v1 value evidence | — |
| [`ai-generation-launch-posture.md`](./ai-generation-launch-posture.md) | Productization M0 launch posture for AI-generation safety claims, limitations, and review routing | — |
| [`launch-blocker-taxonomy.md`](./launch-blocker-taxonomy.md) | Productization M0 launch-blocker severity taxonomy and go/no-go exception posture | — |
| [`workspace-activation-telemetry-contract.md`](./workspace-activation-telemetry-contract.md) | Productization M0 contract for first-run workspace activation telemetry and privacy boundaries | — |
| [`wasm-runtime-wit.md`](./wasm-runtime-wit.md#plan-20) | WASM/WASI runtime & WIT interface reference | 20 |
| [`authoring-resources-wiring.md`](./authoring-resources-wiring.md#plan-21) | Authoring: resource catalog, wiring/manifest, config & the Hobo Code DSL | 21 |
| [`platform-engineering.md`](./platform-engineering.md#plan-25) | Platform engineering: Matching, environments, drivers/packs, Relay/GitOps/pipelines | 25 |
| [`contracts-policy-flags.md`](./contracts-policy-flags.md#plan-29) | Contracts & compatibility, the policy plane & feature flags | 29 |
| [`generated-stack.md`](./generated-stack.md#plan-23) | AI generation, the generated stack, patchability & verification/testing | 23, 09 |
| [`operators-sre.md`](./operators-sre.md#plan-40) | Operator Agents (the Crew) & SRE incident management | 40 |
| [`governance-planes.md`](./governance-planes.md#plan-46) | Governance: compliance/data governance & AI safety | 46 |
| [`worked-example.md`](./worked-example.md#plan-19) | End-to-end worked example | 19 |
| [`walkthrough.md`](./walkthrough.md) | Role-organized ideal-state walkthrough: one app, six workflows (app dev · platform eng · GitOps · SecOps · DevOps · SRE) | — |
| [`billing-launch-policy.md`](./billing-launch-policy.md) | Productization M0 launch billing policy for plans, credits, invoices, payment failures, refunds, and provider/legal boundaries | — |
| [`launch-support-escalation.md`](./launch-support-escalation.md) | Productization M0 launch support escalation matrix, incident communication templates, and support gap routing | — |
| [`example-apps.md`](./example-apps.md) | Productization M0 scope and acceptance for example apps | — |
| [`launch-messaging-claims.md`](./launch-messaging-claims.md) | Productization M0 evidence register for launch claims and demo assets | — |
| [`outcome-activation-rail.md`](./outcome-activation-rail.md) | Productization M0 scope and acceptance for the v1 outcome activation rail | — |
| [`workspace-onboarding-ux.md`](./workspace-onboarding-ux.md) | Productization M0 scope and acceptance for Workspace & Onboarding UX | — |
| [`release-notes-upgrade-guide.md`](./release-notes-upgrade-guide.md) | V1 release notes and upgrade-guide outline contract | — |
| [`beta-pilot-feedback.md`](./beta-pilot-feedback.md) | Productization M0 private-beta cohort, feedback intake, triage, and release-candidate exit contract | — |
| [`dogfood-yard.md`](./dogfood-yard.md) | Productization M0 dogfood Yard acceptance scenarios and telemetry evidence | 04, 05, 07, 40 |
| [`settings-project-lifecycle.md`](./settings-project-lifecycle.md) | Productization M0 settings and project lifecycle scope, state model, ownership, and evidence gate | — |

**Decisions** live as 4 thematic ADR docs in [`adr/`](./adr/README.md) (each decision is a `#adr-NNNN` section). The current ADR/Plan -> Linear coverage gate is [`traceability.md`](./traceability.md). Executable draft proofs and contract packages live under [`../../src/draft/`](../../src/draft/); epic-level reference implementations live in [`../../src/draft/epic-reference-implementations/`](../../src/draft/epic-reference-implementations/) and are registered in [`../../src/draft/epic-reference-implementations/_registry.md`](../../src/draft/epic-reference-implementations/_registry.md).

**Archived planning material** (not part of the current design state — revived when the work is scoped): the **roadmap / build sequence** and the formal **requirements suite** (BRD/PRD/TRD + BR→FR/NFR→TR traceability) live in [`../../archive/`](../../archive/). The design-relevant scope boundary and NFR/SLO targets are kept in the design itself ([ADR-0063](./adr/07-portability-extensibility.md#adr-0063)/[ADR-0064](./adr/07-portability-extensibility.md#adr-0064)/[ADR-0021](./adr/07-portability-extensibility.md#adr-0021)).

**Competitor references** live in [`../../competitors/`](../../competitors/).

**Scope.** The whole suite is **one scope** — every plan is in scope, bounded only by the AI-native-meta-cloud-minus-monetization line ([ADR-0063](./adr/07-portability-extensibility.md#adr-0063)/[ADR-0064](./adr/07-portability-extensibility.md#adr-0064)). Build sequencing/phasing is deferred planning (archived).

**Reading order.** New to HoBo: [Vision](./vision.md#plan-00) → [Architecture](./architecture.md#plan-10) → [Worked example](./worked-example.md#plan-19), then the two deep plans [SDK](./sdk-api.md#plan-02) and [AI-native/agent-auth](./ai-native-agent-auth.md#plan-06). Want it by role: the [Walkthrough](./walkthrough.md) takes one app through six clean workflows — app developer, platform engineer, GitOps, SecOps, DevOps, and SRE — each with its own loop and one shared verb (`hobo up`). Runtime/authoring model: [WASM/WASI](./wasm-runtime-wit.md#plan-20) → [Resources/`.allow()`/wiring](./authoring-resources-wiring.md#plan-21) → [AI implementations](./generated-stack.md#plan-23). Evaluating vs alternatives: [Positioning](./vision.md#plan-17) + [`competitors/`](../../competitors/). Auditing decisions: the [ADR docs](./adr/README.md).

---

## Context

**Problem.** Shipping software still forces application developers to become part-time platform engineers: picking clouds, wiring IaC, designing for HA, and operating infra. Tools today force a bad trade — either an opinionated closed PaaS (simple but locked-in, e.g. **Lakebed**) or raw multi-cloud IaC (powerful but heavy). Neither is built for the world that's coming, where **AI agents are the primary builders and deployers**.

**What HoBo is.** An *intermediary cloud control plane* with a developer-centric, cloud-agnostic programmable surface that is **WIT/WASM** (the Component Model / wasmCloud) — **TypeScript is the first reference implementation, not a requirement**; any Component-Model language authors against the same WIT interfaces ([ADR-0069](./adr/01-architecture-core.md#adr-0069)). Developers describe their app once through **PaaS / SaaS / CaaS / IaaS abstractions**; a **provider pattern** (ports & adapters) maps those abstractions onto real providers. You can map the whole app to a single provider ("just host this on Azure, figure it out"), split tiers across providers, or pin specific boundaries to specific providers — and drop to typed **provider-specific options** when you want to optimize. IaC tools (Pulumi, Crossplane, Terraform/OpenTofu) and image/VM tools (Dagger, Packer, Vagrant, Firecracker) are themselves pluggable via the same ports/adapters pattern.

**Why it wins.** Write cloud-agnostic code that ships anywhere; reach for provider-native power only when you want to. The API *feels like* [Vercel Workflows](https://workflow-sdk.dev/) for its durable `workflow`/`step` ergonomics, but the durable runtime is **HoBo-native and provided per [Camp](#glossary--naming-thematic-all-tunable)** (no dependency on any single vendor's runtime). The whole system is **AI-native**: actor-model + choreography sagas over a replayable event store, agents as first-class authenticated users, a machine-readable **auth/capability standard** so agents self-provision credentials with zero developer effort, and AI-generated provider plugins instead of relying on a community to write them.

**Intended outcome.** A self-hostable (or hosted) **hobo-cloud** orchestrator + an SDK such that a developer (or an agent) can `hobo up` an app and have it land on real infrastructure — agnostic by default, optimizable on demand.

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

HoBo's metaphor is the itinerant worker who travels light. Names are proposals; technical meaning is what matters.

The canonical term source is [`glossary.md`](./glossary.md). The canonical event-family source is [`event-families.md`](./event-families.md). Naming note: `hobo:sdk` is the WIT contract/package; `@hobo/sdk` is the operator SDK. The `docs:design-lint` gate fails on duplicate glossary terms, broken internal links or anchors, unindexed ADR references, `hobo:sdk`/`@hobo/sdk` ambiguity, and event families used outside the catalog.

## Keeping docs current

When a draft package, validation script, workflow, or public contract changes, update this design suite or the nearest proof/contract README in the same change. CI runs `npm run docs:freshness` so implementation-facing changes cannot merge without a documentation update.
