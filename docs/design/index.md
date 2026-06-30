# HoBo — Design Plan Suite

> A suite of inter-related design plans for **HoBo**, a **WIT/WASM** programmable surface (Component Model / wasmCloud) + cloud control plane — TypeScript is the first reference implementation, not a requirement ([ADR-0069](./adr/01-architecture-core.md#adr-0069)).
> This is a **design-first repository, not a shipped HoBo product**. It now includes executable draft proof/contract packages under `src/draft/` plus validation scripts; those packages prove design claims and backlog slices before production implementation. The design is a set of capability docs plus contract records; each plan keeps a stable `#plan-NN` anchor so areas can still be cited precisely.

## Index

Each capability doc is one coherent decision area; some absorb more than one plan (the folded plan keeps its `#plan-NN` anchor in the host doc). Contract records pin public surfaces that cross multiple capability docs. Post-core cross-cutting capability deltas get their own discoverable row here, plus a Linear owner, proof README, traceability row, and executable `src/draft/` proof instead of being folded into completed epics.

| Doc | Covers | Plans |
|---|---|---|
| [`vision.md`](./vision.md#plan-00) | Vision, positioning & guiding principles | 00, 17 |
| [`architecture.md`](./architecture.md#plan-10) | Reference architecture + monorepo/package layout | 10 |
| [`control-plane.md`](./control-plane.md#plan-04) | The Yard control plane; providers, IaC & build/VM adapters | 04 |
| [`sdk-api.md`](./sdk-api.md#plan-02) | SDK / API design (the four-layer model) | 02 |
| [`sdk-contracts.md`](./sdk-contracts.md) | Canonical public SDK signatures, defaults, conformance coverage, and implementation issue mapping | 02, 21 |
| [`closure-builder-public-api.md`](./closure-builder-public-api.md) | V1 explicit Bindle closure-builder public contract for `@hobo/bindles` | 02, 21 |
| [`technical-standards.md`](./technical-standards.md) | Cross-cutting implementation standards: latest stable TypeScript, Protobuf data contracts, CUE invariants/derivative object definitions, parse-don't-validate, and PACT boundary testing | — |
| [`dx-sdk-resilience-semantics.md`](./dx-sdk-resilience-semantics.md) | DX SDK resilience semantics vocabulary, acceptance matrix, and proof sequencing for retry/cancel/deadline/lifecycle behavior | — |
| [`package-namespaces.md`](./package-namespaces.md) | Canonical package/import ownership for `@hobo/*` namespaces | 02, 10, 21 |
| [`ai-native-agent-auth.md`](./ai-native-agent-auth.md#plan-06) | AI-native platform, agent auth & end-user auth | 06 |
| [`data-plane.md`](./data-plane.md#plan-32) | Event model & the data plane: sourcing/replay, reactivity, projections, migrations, search | 11, 32 |
| [`reliability-observability-cost.md`](./reliability-observability-cost.md#plan-05) | Reliability/HA, observability & cost/FinOps | 05 |
| [`security-networking.md`](./security-networking.md#plan-12) | Security, networking & multi-tenant applications | 12, 50 |
| [`developer-experience.md`](./developer-experience.md#plan-07) | Developer experience: dashboards, CLI, status pages & availability | 07, 49 |
| [`cli-spec.md`](./cli-spec.md) | Canonical CLI verb surface + lifecycle semantics | — |
| [`deployment-dashboard-topology-explorer.md`](./deployment-dashboard-topology-explorer.md) | Productization M0 scope and acceptance for Deployment Dashboard & Topology Explorer | — |
| [`plan-diff-viewer.md`](./plan-diff-viewer.md) | Productization M0 scope and acceptance for Plan/Diff Viewer | — |
| [`security-verification.md`](./security-verification.md) | V1 vulnerability disclosure and security launch-blocker process | — |
| [`pre-launch-outcome-contract.md`](./pre-launch-outcome-contract.md) | Productization M0 contract for pre-launch outcome baselines and v1 value evidence | — |
| [`ai-generation-launch-posture.md`](./ai-generation-launch-posture.md) | Productization M0 launch posture for AI-generation safety claims, limitations, and review routing | — |
| [`launch-blocker-taxonomy.md`](./launch-blocker-taxonomy.md) | Productization M0 launch-blocker severity taxonomy and go/no-go exception posture | — |
| [`v1-readiness-dashboard.md`](./v1-readiness-dashboard.md) | Productization M0 dashboard contract for V1 release readiness fields, source-of-truth rules, missing-evidence states, and scope boundaries | — |
| [`go-no-go-decision-record.md`](./go-no-go-decision-record.md) | Productization M0 go/no-go decision record and risk-acceptance workflow | — |
| [`organization-workspace-model.md`](./organization-workspace-model.md) | Productization M0 scope and acceptance for organization, workspace, project, tenant, and environment ownership | — |
| [`workspace-activation-telemetry-contract.md`](./workspace-activation-telemetry-contract.md) | Productization M0 contract for first-run workspace activation telemetry and privacy boundaries | — |
| [`e2e-test-matrix.md`](./e2e-test-matrix.md) | Productization M0 scope and acceptance for the E2E Test Matrix project | — |
| [`performance-load-tests.md`](./performance-load-tests.md) | Productization M0 scope, launch envelope, capacity assumptions, deterministic fixtures, threshold handoffs, and acceptance for Performance & Load Tests | — |
| [`chaos-resilience-tests.md`](./chaos-resilience-tests.md) | Productization M0 scope and acceptance for Chaos & Resilience Tests scenarios, steady-state hypotheses, blast-radius limits, abort rules, evidence handoffs, and follow-up gates | — |
| [`persona-operating-profile.md`](./persona-operating-profile.md) | Productization M0 contract for persona operating profile fields and v1 recommendation memory boundaries | — |
| [`launch-e2e-persona-matrix.md`](./launch-e2e-persona-matrix.md) | Productization M0 contract for launch e2e persona journeys and pass/fail thresholds | — |
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
| [`usage-metering.md`](./usage-metering.md) | Productization M0 scope and acceptance for usage facts, showback dimensions, reconciliation evidence, and support/audit boundaries | — |
| [`usage-to-invoice-reconciliation.md`](./usage-to-invoice-reconciliation.md) | Productization M1 contract for usage-event to invoice-line evidence, corrections, late events, replay, disputes, privacy, and audit handoff | — |
| [`entitlements-plan-limits.md`](./entitlements-plan-limits.md) | Productization M0 scope and acceptance for plan tiers, entitlement categories, limit decisions, support overrides, and follow-up gates | — |
| [`tax-currency-receipt-obligations.md`](./tax-currency-receipt-obligations.md) | Productization M0 launch posture for tax, currency, receipts, invoice metadata, and unsupported jurisdictions | — |
| [`tenant-data-lifecycle.md`](./tenant-data-lifecycle.md) | Productization M0 tenant data inventory, deletion/export obligations, retention posture, residency sensitivity, and customer assurance handoffs | — |
| [`customer-assurance-evidence-packet.md`](./customer-assurance-evidence-packet.md) | Productization M0 customer assurance packet outline for DPA needs, subprocessors, evidence owners, launch limitations, and support/security handoffs | — |
| [`product-notifications-lifecycle.md`](./product-notifications-lifecycle.md) | Productization M0 taxonomy for product lifecycle notifications, preferences, delivery evidence, and scope boundaries | — |
| [`sbom-vulnerability-notice-evidence.md`](./sbom-vulnerability-notice-evidence.md) | Productization M0 evidence contract for SBOMs, dependency vulnerability posture, third-party notices, artifact provenance, and customer assurance readiness | — |
| [`release-artifact-provenance-retention.md`](./release-artifact-provenance-retention.md) | Productization M0 handoff for release artifact provenance, retention, invalidation/yank, offline bundles, and support/debug access | — |
| [`marketplace-publisher-trust-evidence.md`](./marketplace-publisher-trust-evidence.md) | Productization M0 evidence contract for marketplace publisher trust tiers, review evidence, and launch limitations | — |
| [`marketplace-payout-hooks.md`](./marketplace-payout-hooks.md) | Productization M0 scope and acceptance for publisher payout-readiness states, tax/identity handoffs, billing reconciliation, and payout launch limitations | — |
| [`marketplace-ux.md`](./marketplace-ux.md) | Productization M0 scope and acceptance for marketplace browse, trust warnings, installability outcomes, org-catalog visibility, accessibility, and support handoffs | — |
| [`publisher-portal.md`](./publisher-portal.md) | Productization M0 scope and acceptance for publisher profile, maintainer roles, listing evidence, review status, payout-readiness handoffs, support wording, and follow-up gates | — |
| [`capability-review-approval.md`](./capability-review-approval.md) | Productization M0 scope and acceptance for capability review states, approval outcomes, trust-tier evidence, yanking, escalation, and follow-up gates | — |
| [`provenance-retention.md`](./provenance-retention.md) | Productization M0 scope and acceptance for artifact provenance, retention classes, audit export, support handoff, and customer assurance evidence | — |
| [`meta-cloud-broker.md`](./meta-cloud-broker.md) | Productization M0 scope and acceptance for hosted broker authority, broker artifacts, Resolution Receipts, Resolution Rejections, and follow-up gates | — |
| [`launch-support-escalation.md`](./launch-support-escalation.md) | Productization M0 launch support escalation matrix, incident communication templates, and support gap routing | — |
| [`incident-communications.md`](./incident-communications.md) | Productization M0 scope and acceptance for incident communication states, templates, customer-safe publication gates, support handoffs, and follow-up gates | — |
| [`public-status-page-incident-communication.md`](./public-status-page-incident-communication.md) | Productization M0 public status-page scope, component taxonomy, incident states, maintenance notices, update cadence, and customer communication boundaries | — |
| [`support-workflow.md`](./support-workflow.md) | Productization M0 scope and acceptance for support intake, triage states, customer-safe evidence, owner routing, redaction/access boundaries, and follow-up gates | — |
| [`support-sla-channels.md`](./support-sla-channels.md) | Productization M0 support SLA language, channel coverage, response targets, unsupported request routing, and owner signoff boundaries | — |
| [`enterprise-deployment-hardening.md`](./enterprise-deployment-hardening.md) | Productization M0 scope for enterprise deployment hardening postures, evidence handoffs, customer-facing claim limits, and follow-up gates | — |
| [`example-apps.md`](./example-apps.md) | Productization M0 scope and acceptance for example apps | — |
| [`tutorials-walkthroughs.md`](./tutorials-walkthroughs.md) | Productization M0 scope and acceptance for Tutorials & Walkthroughs | — |
| [`troubleshooting-guides.md`](./troubleshooting-guides.md) | Productization M0 scope and acceptance for Troubleshooting Guides | — |
| [`launch-demo-golden-path.md`](./launch-demo-golden-path.md) | Productization M0 golden path and proof asset checklist for the launch demo | — |
| [`launch-messaging-claims.md`](./launch-messaging-claims.md) | Productization M0 evidence register for launch claims and demo assets | — |
| [`outcome-activation-rail.md`](./outcome-activation-rail.md) | Productization M0 scope and acceptance for the v1 outcome activation rail | — |
| [`workspace-onboarding-ux.md`](./workspace-onboarding-ux.md) | Productization M0 scope and acceptance for Workspace & Onboarding UX | — |
| [`accessibility-usability-launch-baseline.md`](./accessibility-usability-launch-baseline.md) | Productization M0 launch baseline for accessibility, usability, evidence, and exception boundaries | — |
| [`release-notes-upgrade-guide.md`](./release-notes-upgrade-guide.md) | V1 release notes and upgrade-guide outline contract | — |
| [`docs-portal.md`](./docs-portal.md) | Productization M0 scope and acceptance for docs portal content areas, source ownership, search metadata, support handoffs, known limitations, and follow-up gates | — |
| [`beta-pilot-feedback.md`](./beta-pilot-feedback.md) | Productization M0 private-beta cohort, feedback intake, triage, and release-candidate exit contract | — |
| [`dogfood-yard.md`](./dogfood-yard.md) | Productization M0 dogfood Yard acceptance scenarios and telemetry evidence | 04, 05, 07, 40 |
| [`upgrade-migration-engine.md`](./upgrade-migration-engine.md) | Productization M0 scope and acceptance for upgrade paths, migration dry-run, rollback evidence, and support handoff | — |
| [`upgrade-test-suite.md`](./upgrade-test-suite.md) | Productization M0 scope and acceptance for upgrade scenario coverage, fixtures, evidence fields, result states, and suite handoffs | — |
| [`bootstrap-installer.md`](./bootstrap-installer.md) | Productization M0 scope and acceptance for SaaS, self-host, and local/dev bootstrap installer paths | — |
| [`backup-restore.md`](./backup-restore.md) | Productization M0 scope and acceptance for backup sources, restore paths, RPO/RTO drill evidence, and recovery handoffs | — |
| [`settings-project-lifecycle.md`](./settings-project-lifecycle.md) | Productization M0 settings and project lifecycle scope, state model, ownership, and evidence gate | — |
| [`environment-lifecycle.md`](./environment-lifecycle.md) | Productization M0 scope and acceptance for environment classes, lifecycle states, transition owners, support evidence, and follow-up gates | — |
| [`admin-console.md`](./admin-console.md) | Productization M0 scope and acceptance for Admin Console navigation, read models, action intents, audit/redaction, and support/security boundaries | — |
| [`audit-explorer.md`](./audit-explorer.md) | Productization M0 scope and acceptance for Audit Explorer audit facts, tenant-first filters, export evidence, redaction, and support/security/governance boundaries | — |
| [`member-rbac-administration.md`](./member-rbac-administration.md) | Productization M0 scope and acceptance for member lifecycle, RBAC administration, role boundaries, and audit handoff | — |
| [`tenant-isolation-quotas.md`](./tenant-isolation-quotas.md) | Productization M0 scope and acceptance for tenant isolation axes, quota dimensions, owning boundaries, and M1 evidence gates | — |
| [`org-catalogs.md`](./org-catalogs.md) | Productization M0 scope and acceptance for org catalog kinds, approval states, evidence fields, owner handoffs, and scope boundaries | — |
| [`resource-garbage-collection.md`](./resource-garbage-collection.md) | Productization M0 scope and acceptance for resource garbage classes, cleanup eligibility, orphan evidence, owner handoffs, and safe cleanup boundaries | — |
| [`compatibility-matrix.md`](./compatibility-matrix.md) | Productization M0 browser, device, platform, CLI bootstrap, and support-routing compatibility matrix | — |

**Decisions** live as 4 thematic ADR docs in [`adr/`](./adr/index.md) (each decision is a `#adr-NNNN` section). The current ADR/Plan -> Linear coverage gate is [`traceability.md`](./traceability.md). Executable draft proofs and contract packages live under [`../../src/draft/`](../../src/draft/); epic-level reference implementations live in [`../../src/draft/epic-reference-implementations/`](../../src/draft/epic-reference-implementations/) and are registered in [`../../src/draft/epic-reference-implementations/_registry.md`](../../src/draft/epic-reference-implementations/_registry.md).

**Archived planning material** (not part of the current design state — revived when the work is scoped): the **roadmap / build sequence** and the formal **requirements suite** (BRD/PRD/TRD + BR→FR/NFR→TR traceability) live in [`../archive/`](../archive/). The design-relevant scope boundary and NFR/SLO targets are kept in the design itself ([ADR-0063](./adr/07-portability-extensibility.md#adr-0063)/[ADR-0064](./adr/07-portability-extensibility.md#adr-0064)/[ADR-0021](./adr/07-portability-extensibility.md#adr-0021)).

**Competitor references** live in [`../competitors/`](../competitors/).

**Scope.** The whole suite is **one scope** — every plan is in scope, bounded only by the AI-native-meta-cloud-minus-monetization line ([ADR-0063](./adr/07-portability-extensibility.md#adr-0063)/[ADR-0064](./adr/07-portability-extensibility.md#adr-0064)). Build sequencing/phasing is deferred planning (archived).

**Reading order.** New to HoBo: [Vision](./vision.md#plan-00) → [Architecture](./architecture.md#plan-10) → [Worked example](./worked-example.md#plan-19), then the two deep plans [SDK](./sdk-api.md#plan-02) and [AI-native/agent-auth](./ai-native-agent-auth.md#plan-06). Want it by role: the [Walkthrough](./walkthrough.md) takes one app through six clean workflows — app developer, platform engineer, GitOps, SecOps, DevOps, and SRE — each with its own loop and one shared verb (`hobo up`). Runtime/authoring model: [WASM/WASI](./wasm-runtime-wit.md#plan-20) → [Resources/`.allow()`/wiring](./authoring-resources-wiring.md#plan-21) → [AI implementations](./generated-stack.md#plan-23). Evaluating vs alternatives: [Positioning](./vision.md#plan-17) + [`docs/competitors/`](../competitors/). Auditing decisions: the [ADR docs](./adr/index.md).

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

## Technical standards

All implementation-facing design work follows the cross-cutting standards in [`technical-standards.md`](./technical-standards.md): latest stable TypeScript over vanilla JavaScript, Protobuf for data contracts, CUE for invariants/dependent constraints and derivative object definitions, parse-don't-validate at trust boundaries, and PACT-style contract tests for integration edges. These standards reinforce the suite's existing WIT/WASM portability model by catching schema, compatibility, and invariant drift before runtime.

## Keeping docs current

When a draft package, validation script, workflow, or public contract changes, update this design suite or the nearest proof/contract README in the same change. CI runs `pnpm run docs:freshness` so implementation-facing changes cannot merge without a documentation update.

- [Contract-First Testing Strategy](./contract-first-testing.md)
