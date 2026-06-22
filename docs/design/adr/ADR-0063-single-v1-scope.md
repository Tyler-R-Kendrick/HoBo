# ADR-0063 — Single v1 scope (the whole designed surface ships as one v1)

- **Status:** Accepted (supersedes [ADR-0022](./ADR-0022-mvp-scope-moscow.md))
- **Date:** 2026-06-22
- **Deciders:** Product, Engineering, Founders
- **Related:** [08 v1 delivery plan](../08-roadmap.md) · [phases/](../phases/README.md) · [ADR-0022](./ADR-0022-mvp-scope-moscow.md) (superseded) · [ADR-0019](./ADR-0019-persona-prioritization-icp.md) · [ADR-0021](./ADR-0021-nfr-baselines-slos.md) · [BRD §Scope](../../requirements/BRD.md) · [PRD §Release criteria](../../requirements/PRD.md)

## Context
[ADR-0022](./ADR-0022-mvp-scope-moscow.md) drew the MVP line at the **end of P4** and bound requirement priority (MoSCoW) to roadmap phases P0–P6: Forge was "Should (P5)", HA/FinOps/full-dashboard/platform-engineering-at-depth were "Could (P6)", and a "Won't (v1)" bucket deferred the rest. The design suite also accreted in **iteration waves** (v2 runtime/authoring, v3 Humanitec parity, v4 gates, v5 onboarding, v6 operators/SRE/UI, v7 completeness planes), each "placed" into a later phase. The product is still in its design phase, the full surface is now designed and internally coherent, and the directive is to **ship it all as one v1** — "it's okay to have a massive implementation plan for v1; we can deliver quickly and effectively."

The phased line was a *sequencing and risk* tool, not an architectural boundary. Nothing in the architecture requires the capabilities to land as separate releases — the dependencies are a build order, not a version ladder.

## Decision
**v1 scope = the entire designed surface.** Every plan in the suite ([Plan 0](../00-vision.md)–[Plan 48](../48-marketplace-ecosystem.md)) and every former phase (P0–P6) and iteration wave (v2–v7) is **v1**. Specifically:

1. **No release split.** There is no v2/v3/… and no "post-v1": Forge, multi-region HA, full FinOps showback, the complete dashboard, platform-engineer Resource Definitions/Matching/Packs at depth, the Operator Crew, the generated infrastructure stack, patchability, SRE/incident-management, and the governance planes (governance enforcement, AI safety) + the `notify` port + Registry distribution are **all v1**. *(Scope is bounded by [ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md) (AI-native meta-cloud: no business/app-build-out) — UI-layer generation, billing/monetization, marketplace-as-a-plane and app-communications-as-a-plane are **out of scope**, not deferred.)*
2. **No deferred bucket.** The former ADR-0022 **"Won't (v1)"** list is dissolved. Its in-scope feature-like items fold into v1: the full/non-developer dashboard ([Plan 7](../07-ui-dashboard.md)); broad cloud coverage, delivered **on demand via the Forge** ([Plan 33](../33-forge-generation-pipeline.md)) + the provider port rather than pre-enumerated.
3. **Build stages replace phases.** P0–P6 are reframed as **dependency-ordered build stages of v1** ([phases/](../phases/README.md)): foundations → SDK-local → first-deploy(+gates) → AI-native → multi-provider → Forge → HA/FinOps/UX/planes. Stages are *how* a large v1 is delivered in order; they are not separate versions. The **v1 definition of done = every stage's acceptance gate green** ([PRD §9](../../requirements/PRD.md)).
4. **Priority becomes build order, not version gate.** MoSCoW on requirements ([BRD §8](../../requirements/BRD.md)/[PRD §6](../../requirements/PRD.md)) now expresses **build priority/sequencing within v1**, not a release boundary; everything Must/Should/Could is in v1.
5. **Anti-goals are positioning, not deferrals.** A small set of stances remain genuine non-goals because they describe what HoBo *is not* (not features awaiting a later version): HoBo **composes** IaC engines (Pulumi/Terraform/OpenTofu) via the IaC port rather than replacing them ([Plan 3](../03-providers-iac.md)); it is not a standalone secret-management product or a generic app framework ([00 non-goals](../00-vision.md)). These are unchanged by this ADR.

Genuine *technical* first-cut scoping inside individual capability designs (e.g. provider-store active-active/CDC, the multi-Yard **Junction** [ADR-0043](./ADR-0043-multi-yard-federation-junction.md), incremental view maintenance, full ITSM) remain honest "first implementation" notes and **iteration hooks within v1** — they are no longer tied to a removed release number, but this ADR does not claim CAP-impossible or out-of-first-cut sub-features are complete.

## Alternatives considered
- **Keep the P4 MVP line (ADR-0022).** Rejected per the directive: the design is complete and coherent enough to commit to a single v1; phasing the *release* now adds coordination overhead without de-risking the architecture.
- **Merge everything but keep a thin "Won't" bucket.** Offered to the user; they chose "literally everything in v1, no deferred bucket." Only true positioning anti-goals are retained.
- **Delete the `phases/` breakdown and write one flat plan.** Rejected: the dependency-ordered stages are exactly how a massive v1 stays deliverable; we keep them, reframed as build stages, not versions.

## Consequences
- **(+)** One unambiguous scope: "v1 is everything designed." No per-feature "which version?" question; the roadmap is a build sequence.
- **(+)** The breadth planes (governance, AI safety, comms, marketplace, HA, FinOps) are committed, not aspirational — they ride existing machinery (ports, policy, events, conformance) with no new runtime.
- **(−)** v1 is a **large** surface; delivery risk concentrates in execution sequencing rather than scope negotiation. Mitigation: the build stages are independently demoable and each keeps prior acceptance gates green (no regressions), so progress is continuously verifiable.
- **(−)** Several NFR baselines ([ADR-0021](./ADR-0021-nfr-baselines-slos.md)) can only be fully measured once the late stages (multi-region HA) exist; earlier stages verify them on representative-but-partial setups.
- **(↔)** ADR-0022 is **Superseded** (kept for history); the BRD/PRD/TRD and `requirements/README` are updated so MoSCoW reads as build priority within v1 and release criteria are a single v1 definition of done.
