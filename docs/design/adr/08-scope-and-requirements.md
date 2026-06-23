# Scope, requirements process & NFR baselines — consolidated decisions

> Consolidated ADR decisions for **scope, requirements process & nfr baselines**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0018
**Requirements-artifact structure & traceability scheme.**

### Context
HoBo's design suite (`docs/design/0–30`) is engineering-shaped: it explains *how* the system works but does not expose the **requirements layer** that business, product, and platform stakeholders sign off on. We need formal Business / Product / Technical requirements that are **mutually consistent** and **traceable**, without duplicating or forking the design docs (which remain the source of design truth). The risk of three free-standing documents is drift: a business goal with no product feature, a feature with no technical owner, an NFR no one verifies.

### Decision
1. **Three documents, one folder.** `docs/requirements/` holds `BRD.md` (why/business), `PRD.md` (what/product), `TRD.md` (how/technical, in requirements terms), plus a `README.md` index. They **cite** `docs/design/*` rather than restating it.
2. **Stable requirement IDs.** Each requirement gets a typed, immutable ID:
   - `BR-NNN` — business requirement (BRD)
   - `FR-NNN` — functional requirement (PRD)
   - `NFR-NNN` — non-functional requirement (PRD)
   - `TR-NNN` — technical requirement (TRD)
3. **Forward traceability is mandatory.** Every `BR` maps to ≥1 `FR`/`NFR`; every `FR`/`NFR` maps to ≥1 `TR`; every `TR` cites the design doc(s) and (where relevant) the conformance/verification that proves it. The TRD owns the authoritative **BR→FR/NFR→TR traceability matrix**.
4. **Priority vocabulary** is MoSCoW (`Must`/`Should`/`Could`), expressing **build priority/order within the single v1** — all requirements are v1, mapped to the build stages in the [per-stage build detail](../08-roadmap.md#per-stage-build-detail-stages-06) (see [ADR-0063](#adr-0063), superseding the former ADR-0022 MVP-scope line; there is no `Won't`-for-v1 tier).
5. **Style** is "formal but skimmable": standard enterprise section set (document control, RACI, sign-off, risk register) rendered as tables/short prose to match the suite's voice.

### Alternatives considered
- **Numbered design docs (`31/32/33`)** — rejected: requirements are a different artifact class with a different audience and review cadence than design plans; mixing them muddies both.
- **A single combined PRD/BRD/TRD** — rejected: the three audiences and sign-off owners differ; separation enables independent approval.
- **No formal IDs** — rejected: traceability and review depend on stable identifiers.

### Consequences
- **(+)** Coverage gaps become visible (an orphan `BR` or an unverified `NFR` is a defect). Reviews and audits can target IDs.
- **(+)** Design docs stay the single source of design truth; requirement docs stay thin and reference-driven.
- **(−)** The traceability matrix is maintenance that must be kept current as design docs evolve; stale IDs are a real failure mode. Mitigation: the matrix lives only in the TRD (one place), and the link/coverage check is part of doc verification.

## ADR-0019
**Persona prioritization / primary ICP.**

### Context
HoBo serves four distinct personas — **application developers**, **platform engineers**, **operators**, and **AI agents-as-users** ([00-vision.md](../00-vision.md), [06-ai-native-agent-auth.md](../06-ai-native-agent-auth.md)). All four are served in the single v1 ([ADR-0063](#adr-0063)), but the build can't optimize for all four at once; leading with the wrong one would dilute the wedge. Positioning ([17](../17-positioning-competitive.md)) already names the wedge: developer-centric, agnostic-by-default, agent-operable, with Lakebed/Vercel-grade onboarding. We commit a **build-emphasis order** so the BRD/PRD scope and the v1 build stages ([per-stage build detail](../08-roadmap.md#per-stage-build-detail-stages-06)) align to one primary Ideal Customer Profile (ICP) without deferring any persona to a later release.

### Decision
All four personas are in v1; we prioritize **build emphasis** (which to nail first) in this order:
1. **Primary ICP — the indie/startup TypeScript developer *and* the AI agent acting on their behalf.** These are co-primary: the developer authors a Bindle; the agent deploys/operates it via MCP. Every capability must be reachable by both (SDK/CLI **and** MCP), with first-class agent identity. Anchored from the earliest build stages.
2. **Platform engineer** (defines Resource Definitions, mapping rules, policy/cost guardrails). Fully in v1; their surface deepens once multi-provider + governance are in place (build stage 4 onward).
3. **Multi-tenant hosted operator** (runs a hosted Yard for others). In v1; the hosted HA/FinOps/multi-region substrate it relies on lands in the later build stages. Self-host single-tenant works from the first deploy because "self-host = hosted" is the same code.

### Alternatives considered
- **Platform-engineer-first (Humanitec/IDP posture)** — rejected for v1: leads with governance before there is a developer base to govern; slower to a "wow" moment.
- **Enterprise-operator-first** — rejected: requires multi-tenant HA + compliance up front (late-stage work) before the core agnostic-deploy thesis is proven.
- **Human-developer-only, agents later** — rejected: contradicts the "agents are users, not afterthoughts" principle ([00-vision.md](../00-vision.md)) and the core differentiator.

### Consequences
- **(+)** Sharpens the early build stages around the develop→deploy→agent-operate loop; the MCP surface and keyless identity are not deferrable.
- **(+)** Gives marketing/positioning one clear ICP to address.
- **(−)** Platform-engineer features (Resource Definitions/Matching, policy packs) are in v1 but built after the core loop (build stage 4+); they are sequenced later, not cut. The design already accommodates them ([25](../25-resource-definitions-matching.md), [30](../30-policy-plane.md)); only *build order* differs, not scope or architecture.

## ADR-0021
**NFR baselines / committed SLOs for v1.** Proposed (numbers pending stakeholder ratification)

### Context
[08-roadmap.md](../08-roadmap.md) defines **north-star signals** (time-to-first-deploy, "same Bindle, N clouds", zero-secret rate, agent-completable lifecycle, Forge yield, recovery) but they are *directional*, not testable thresholds. [05-reliability-ha.md](../05-reliability-ha.md) lists initial HA targets explicitly marked "to ratify with the user." A PRD needs **measurable NFRs** with numbers so they can be verified ([09](../09-verification-open-questions.md)) and used as release gates. Numbers proposed here are **defaults to ratify**, not contractual SLAs.

### Decision
Adopt these v1 NFR baselines (each becomes an `NFR-` in the PRD with a verification method):

| Dimension | Baseline (v1) | Source / verified by |
|---|---|---|
| Time-to-first-deploy (scaffold → running on real cloud) | ≤ 10 min p50 on the happy path | north-star ([08](../08-roadmap.md)); E2E timing test |
| Local dev start (`hobo dev`, no cloud) | ≤ 60 s | [15-cli-dx.md](../15-cli-dx.md); integration test |
| Zero-secret rate (provider access via brokered/federated tokens) | ≥ 99% of provider calls; static keys only via explicit legacy escape hatch | [06](../06-ai-native-agent-auth.md)/[12](../12-security-multitenancy.md); audit of `token.*` events |
| Portability ("same Bindle, N clouds" unedited) | ≥ 2 providers for the reference app at v1, design target N | [03](../03-providers-iac.md); `multi-cloud-shop` E2E |
| Control-plane availability | 99.9% single-region / 99.95% multi-region | [05](../05-reliability-ha.md) |
| Deploy resume after node loss | < 30 s (lease TTL + tail replay) | [05](../05-reliability-ha.md); chaos test |
| RPO | ~0 (sync quorum) / ≤ 5 s (async tier) | [05](../05-reliability-ha.md) |
| RTO (full Yard rebuild from log) | < 15 min | [05](../05-reliability-ha.md); DR replay test |
| Plan-time cost estimate accuracy | within ±20% of a known fixture | [16](../16-cost-finops.md); cost fixture test |
| Determinism | `replay == live state` for every durable run (hard invariant) | [09](../09-verification-open-questions.md); determinism test |

### Alternatives considered
- **Leave NFRs qualitative** — rejected: unverifiable NFRs are not requirements; release gates need numbers.
- **Commit aggressive enterprise SLAs (e.g. 99.99%) now** — rejected: premature before multi-region HA (build stage 6) is proven; over-promises.

### Consequences
- **(+)** PRD NFRs become testable; [09](../09-verification-open-questions.md) gains concrete fixtures; releases can gate on them.
- **(+)** Determinism and zero-secret are treated as **hard invariants**, not best-effort.
- **(−)** Status stays **Proposed** until ratified; some numbers (availability, cost accuracy) can only be measured once the later build stages exist (multi-region HA, full cost model), so earlier stages verify them on representative-but-partial setups. Re-ratify when build stage 6 lands.

## ADR-0063
**Single v1 scope (the whole designed surface ships as one v1).** Accepted (supersedes the former ADR-0022 MVP-scope/MoSCoW line)

### Context
The former ADR-0022 drew the MVP line at the **end of P4** and bound requirement priority (MoSCoW) to roadmap phases P0–P6: Forge was "Should (P5)", HA/FinOps/full-dashboard/platform-engineering-at-depth were "Could (P6)", and a "Won't (v1)" bucket deferred the rest. The design suite also accreted in **iteration waves** (v2 runtime/authoring, v3 Humanitec parity, v4 gates, v5 onboarding, v6 operators/SRE/UI, v7 completeness planes), each "placed" into a later phase. The product is still in its design phase, the full surface is now designed and internally coherent, and the directive is to **ship it all as one v1** — "it's okay to have a massive implementation plan for v1; we can deliver quickly and effectively."

The phased line was a *sequencing and risk* tool, not an architectural boundary. Nothing in the architecture requires the capabilities to land as separate releases — the dependencies are a build order, not a version ladder.

### Decision
**v1 scope = the entire designed surface.** Every plan in the suite ([Plan 0](../00-vision.md)–[Plan 47](../47-ai-safety-model-governance.md)) and every former phase (P0–P6) and iteration wave (v2–v7) is **v1**. Specifically:

1. **No release split.** There is no v2/v3/… and no "post-v1": Forge, multi-region HA, full FinOps showback, the complete dashboard, platform-engineer Resource Definitions/Matching/Packs at depth, the Operator Crew, the generated infrastructure stack, patchability, SRE/incident-management, and the governance planes (governance enforcement, AI safety) + the `notify` port + Registry distribution are **all v1**. *(Scope is bounded by [ADR-0064](#adr-0064) (AI-native meta-cloud: no business/app-build-out) — UI-layer generation, billing/monetization, marketplace-as-a-plane and app-communications-as-a-plane are **out of scope**, not deferred.)*
2. **No deferred bucket.** The former ADR-0022 **"Won't (v1)"** list is dissolved. Its in-scope feature-like items fold into v1: the full/non-developer dashboard ([Plan 7](../07-ui-dashboard.md)); broad cloud coverage, delivered **on demand via the Forge** ([Plan 33](../33-forge-generation-pipeline.md)) + the provider port rather than pre-enumerated.
3. **Build stages replace phases.** P0–P6 are reframed as **dependency-ordered build stages of v1** ([Per-stage build detail](../08-roadmap.md#per-stage-build-detail-stages-06)): foundations → SDK-local → first-deploy(+gates) → AI-native → multi-provider → Forge → HA/FinOps/UX/planes. Stages are *how* a large v1 is delivered in order; they are not separate versions. The **v1 definition of done = every stage's acceptance gate green** ([PRD §9](../../requirements/PRD.md)).
4. **Priority becomes build order, not version gate.** MoSCoW on requirements ([BRD §8](../../requirements/BRD.md)/[PRD §6](../../requirements/PRD.md)) now expresses **build priority/sequencing within v1**, not a release boundary; everything Must/Should/Could is in v1.
5. **Anti-goals are positioning, not deferrals.** A small set of stances remain genuine non-goals because they describe what HoBo *is not* (not features awaiting a later version): HoBo **composes** IaC engines (Pulumi/Terraform/OpenTofu) via the IaC port rather than replacing them ([Plan 3](../03-providers-iac.md)); it is not a standalone secret-management product or a generic app framework ([00 non-goals](../00-vision.md)). These are unchanged by this ADR.

Genuine *technical* first-cut scoping inside individual capability designs (e.g. provider-store active-active/CDC, the multi-Yard **Junction** [ADR-0043](07-portability-extensibility.md#adr-0043), incremental view maintenance, full ITSM) remain honest "first implementation" notes and **iteration hooks within v1** — they are no longer tied to a removed release number, but this ADR does not claim CAP-impossible or out-of-first-cut sub-features are complete.

### Alternatives considered
- **Keep the P4 MVP line (the former ADR-0022).** Rejected per the directive: the design is complete and coherent enough to commit to a single v1; phasing the *release* now adds coordination overhead without de-risking the architecture.
- **Merge everything but keep a thin "Won't" bucket.** Offered to the user; they chose "literally everything in v1, no deferred bucket." Only true positioning anti-goals are retained.
- **Drop the per-stage breakdown and write one flat plan.** Rejected: the dependency-ordered stages are exactly how a massive v1 stays deliverable; we keep them (now folded into the [roadmap](../08-roadmap.md#per-stage-build-detail-stages-06)), reframed as build stages, not versions.

### Consequences
- **(+)** One unambiguous scope: "v1 is everything designed." No per-feature "which version?" question; the roadmap is a build sequence.
- **(+)** The breadth planes (governance, AI safety, comms, marketplace, HA, FinOps) are committed, not aspirational — they ride existing machinery (ports, policy, events, conformance) with no new runtime.
- **(−)** v1 is a **large** surface; delivery risk concentrates in execution sequencing rather than scope negotiation. Mitigation: the build stages are independently demoable and each keeps prior acceptance gates green (no regressions), so progress is continuously verifiable.
- **(−)** Several NFR baselines ([ADR-0021](#adr-0021)) can only be fully measured once the late stages (multi-region HA) exist; earlier stages verify them on representative-but-partial setups.
- **(↔)** The former ADR-0022 (MVP-scope/MoSCoW line) is **superseded and removed**; the BRD/PRD/TRD and `requirements/README` are updated so MoSCoW reads as build priority within v1 and release criteria are a single v1 definition of done.

## ADR-0064
**Scope: AI-native meta-cloud (remove business + app-build-out).** Accepted (supersedes [ADR-0020](./README.md) monetization model, now removed)

### Context
HoBo is an **AI-native meta-cloud** — a direct competitor to **Convex, Lakebed.dev, and Nitric**: a portable durable runtime + a cloud-agnostic provisioning control plane that any cloud's primitives plug into via ports, operable by agents, with the **Forge** generating the missing adapters. As the suite grew it accreted two kinds of scope that drift past a meta-cloud:
1. **SaaS-business functions** — billing, subscriptions, invoicing, tax/VAT, chargeback, monetization, rev-share. HoBo is not a payments/billing product, and a meta-cloud should not carry a commercial toolkit.
2. **App-build-out** — generating the developer's *own product*, in particular its **UI** (and the "generate your whole app" framing of the generated stack). Writing the user's application is a different category from running it on any cloud.

### Decision
**Scope HoBo to the meta-cloud.** The test for any capability: ***would Convex, Nitric, or Lakebed ship this as a platform capability?*** Note that *developer-facing ≠ out of scope* — these competitors are batteries-included; the cut line is **business + app-build-out**, not "non-developer."

1. **Keep** (in scope): cloud/infra orchestration; the durable, event-sourced runtime; AI-native agents + MCP; the Forge (AI-generated **infrastructure** — providers/adapters/implementations behind ports) and self-optimizing runtime functions (`"use training"`); and the developer-facing **cloud primitives** (data, reactivity, auth, search, messaging, storage) as ports. Cloud-cost **FinOps** (estimates/budgets/showback/quotas/spend-safety) stays — it is infra, not money.
2. **Remove — business/monetization:** the monetization model (ADR-0020, deleted); the `billing` port / chargeback / invoicing / tax / rev-share; ADR-0039 retitled to *Metering, quota & cost attribution* (FinOps only); the marketplace's monetize lifecycle.
3. **Remove — app-build-out:** UI-layer generation (Plan 42), the **UX-Designer** operator (Plan 40), the **UI layer** of the generated stack (Plan 41), the `ui-render` port, and `Design.md`. AI generation is refocused to **infrastructure + runtime** (Forge + `"use training"` + data/message glue), not "generate the developer's product."
4. **Consolidate:** `notify` (email/sms/push/webhook) becomes a thin **cloud-messaging port** in the resource catalog, not a standalone plane; the marketplace's publish/discover/install/trust folds into the **Registry** + **Resource Packs**; governance planes (compliance, AI safety) keep their **enforcement** machinery, trimming the compliance-program paperwork framing.
5. **Tombstone, don't renumber.** Removed plan numbers (42, 45, 48) become short "removed — out of scope" stubs that preserve links and point to where the capability folded.

### Alternatives considered
- **Keep monetization + UI generation as differentiators.** Rejected: they push HoBo from a meta-cloud into a SaaS-business + app-builder, blurring the Convex/Lakebed/Nitric positioning and adding maintenance surface unrelated to the thesis.
- **Cut only the literal billing list, keep everything else.** Rejected: leaves the app-build-out drift (UI generation) and the sprawl the directive ("consolidate and tighten") asked to remove.
- **Delete the generated-stack plan entirely.** Considered; instead refocused it to infrastructure/runtime generation so the Forge + use-training story stays coherent.

### Consequences
- **(+)** Sharper, more defensible identity: the uncontested intersection (agnostic IfC + durable event-sourced runtime + agents/Forge + conformance + patchability) survives intact; the business/app-build-out sprawl leaves.
- **(+)** Smaller surface to design, build, and maintain; clearer competitive story vs Convex/Lakebed/Nitric.
- **(−)** Loses the "generates your UI / whole app" differentiator and any first-party commercial story in the docs (commercialization is now out of design scope).
- **(↔)** Updates ripple through the suite: ADR-0063 (v1 scope list), the roadmap/phases (stage 6), the requirements (BRD/PRD/TRD), the event model, the glossary/index, and the gap-analysis. Removed numbers are tombstoned, not reused.

## Open / proposed decisions (ADR-Pn)
- **ADR-P1:** consensus for the built-in engine (own Raft vs delegate to the Camp's runtime store) — [Plan 5](../05-reliability-ha.md).
- **ADR-P2:** overlay-mesh technology for cross-provider connectivity — [Plan 13](../13-networking-connectivity.md).
- **ADR-P3:** ~~policy language for guardrails/ABAC~~ — **Resolved by ADR-0015** (typed TS default; OPA/Cedar optional providers behind the `policy-engine` port).
- **ADR-P4:** ~~default Planner objective (cost-first vs latency-first)~~ — **Resolved by [ADR-0033](05-config-matching-environments.md#adr-0033)**: configurable `cost`|`latency`|`single-provider`|`carbon`, **default min-cost within constraints**, applied as a deterministic lexicographic tiebreak (no on-path solver/LLM) — [Plan 16](../16-cost-finops.md)/[Plan 25](../25-resource-definitions-matching.md).
- **ADR-P5:** documented default for the workflow directive vs wrapper (compiler transform depth) — [Plan 2](../02-sdk-api.md).
