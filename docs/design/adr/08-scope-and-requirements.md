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
4. **Priority vocabulary** is MoSCoW (`Must`/`Should`/`Could`), expressing **build priority/order within the single v1** — all requirements are v1, mapped to the build stages in the [per-stage build detail](../roadmap.md#per-stage-build-detail-stages-06) (see [ADR-0063](#adr-0063), superseding the former ADR-0022 MVP-scope line; there is no `Won't`-for-v1 tier).
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
HoBo serves four distinct personas — **application developers**, **platform engineers**, **operators**, and **AI agents-as-users** ([vision.md#plan-00](../vision.md#plan-00), [ai-native-agent-auth.md#plan-06](../ai-native-agent-auth.md#plan-06)). All four are served in the single v1 ([ADR-0063](#adr-0063)), but the build can't optimize for all four at once; leading with the wrong one would dilute the wedge. Positioning ([17](../positioning.md#plan-17)) already names the wedge: developer-centric, agnostic-by-default, agent-operable, with Lakebed/Vercel-grade onboarding. We commit a **build-emphasis order** so the BRD/PRD scope and the v1 build stages ([per-stage build detail](../roadmap.md#per-stage-build-detail-stages-06)) align to one primary Ideal Customer Profile (ICP) without deferring any persona to a later release.

### Decision
All four personas are in v1; we prioritize **build emphasis** (which to nail first) in this order:
1. **Primary ICP — the indie/startup TypeScript developer *and* the AI agent acting on their behalf.** These are co-primary: the developer authors a Bindle; the agent deploys/operates it via MCP. Every capability must be reachable by both (SDK/CLI **and** MCP), with first-class agent identity. Anchored from the earliest build stages.
2. **Platform engineer** (defines Resource Definitions, mapping rules, policy/cost guardrails). Fully in v1; their surface deepens once multi-provider + governance are in place (build stage 4 onward).
3. **Multi-tenant hosted operator** (runs a hosted Yard for others). In v1; the hosted HA/FinOps/multi-region substrate it relies on lands in the later build stages. Self-host single-tenant works from the first deploy because "self-host = hosted" is the same code.

### Alternatives considered
- **Platform-engineer-first (Humanitec/IDP posture)** — rejected for v1: leads with governance before there is a developer base to govern; slower to a "wow" moment.
- **Enterprise-operator-first** — rejected: requires multi-tenant HA + compliance up front (late-stage work) before the core agnostic-deploy thesis is proven.
- **Human-developer-only, agents later** — rejected: contradicts the "agents are users, not afterthoughts" principle ([vision.md#plan-00](../vision.md#plan-00)) and the core differentiator.

### Consequences
- **(+)** Sharpens the early build stages around the develop→deploy→agent-operate loop; the MCP surface and keyless identity are not deferrable.
- **(+)** Gives marketing/positioning one clear ICP to address.
- **(−)** Platform-engineer features (Resource Definitions/Matching, policy packs) are in v1 but built after the core loop (build stage 4+); they are sequenced later, not cut. The design already accommodates them ([25](../platform-engineering.md#plan-25), [30](../contracts-policy-flags.md#plan-30)); only *build order* differs, not scope or architecture.

## ADR-0021
**NFR baselines / committed SLOs for v1.** Proposed (numbers pending stakeholder ratification)

### Context
[roadmap.md#plan-08](../roadmap.md#plan-08) defines **north-star signals** (time-to-first-deploy, "same Bindle, N clouds", zero-secret rate, agent-completable lifecycle, Forge yield, recovery) but they are *directional*, not testable thresholds. [reliability-observability-cost.md#plan-05](../reliability-observability-cost.md#plan-05) lists initial HA targets explicitly marked "to ratify with the user." A PRD needs **measurable NFRs** with numbers so they can be verified ([09](../verification.md#plan-09)) and used as release gates. Numbers proposed here are **defaults to ratify**, not contractual SLAs.

### Decision
Adopt these v1 NFR baselines (each becomes an `NFR-` in the PRD with a verification method):

| Dimension | Baseline (v1) | Source / verified by |
|---|---|---|
| Time-to-first-deploy (scaffold → running on real cloud) | ≤ 10 min p50 on the happy path | north-star ([08](../roadmap.md#plan-08)); E2E timing test |
| Local dev start (`hobo dev`, no cloud) | ≤ 60 s | [developer-experience.md#plan-15](../developer-experience.md#plan-15); integration test |
| Zero-secret rate (provider access via brokered/federated tokens) | ≥ 99% of provider calls; static keys only via explicit legacy escape hatch | [06](../ai-native-agent-auth.md#plan-06)/[12](../security-networking.md#plan-12); audit of `token.*` events |
| Portability ("same Bindle, N clouds" unedited) | ≥ 2 providers for the reference app at v1, design target N | [03](../control-plane.md#plan-03); `multi-cloud-shop` E2E |
| Control-plane availability | 99.9% single-region / 99.95% multi-region | [05](../reliability-observability-cost.md#plan-05) |
| Deploy resume after node loss | < 30 s (lease TTL + tail replay) | [05](../reliability-observability-cost.md#plan-05); chaos test |
| RPO | ~0 (sync quorum) / ≤ 5 s (async tier) | [05](../reliability-observability-cost.md#plan-05) |
| RTO (full Yard rebuild from log) | < 15 min | [05](../reliability-observability-cost.md#plan-05); DR replay test |
| Plan-time cost estimate accuracy | within ±20% of a known fixture | [16](../reliability-observability-cost.md#plan-16); cost fixture test |
| Determinism | `replay == live state` for every durable run (hard invariant) | [09](../verification.md#plan-09); determinism test |

### Alternatives considered
- **Leave NFRs qualitative** — rejected: unverifiable NFRs are not requirements; release gates need numbers.
- **Commit aggressive enterprise SLAs (e.g. 99.99%) now** — rejected: premature before multi-region HA (build stage 6) is proven; over-promises.

### Consequences
- **(+)** PRD NFRs become testable; [09](../verification.md#plan-09) gains concrete fixtures; releases can gate on them.
- **(+)** Determinism and zero-secret are treated as **hard invariants**, not best-effort.
- **(−)** Status stays **Proposed** until ratified; some numbers (availability, cost accuracy) can only be measured once the later build stages exist (multi-region HA, full cost model), so earlier stages verify them on representative-but-partial setups. Re-ratify when build stage 6 lands.

## ADR-0063
**Single scope: the whole designed surface ships together.**

### Context
HoBo is in its design phase; nothing has shipped and no release ladder is committed. The full surface is designed and internally coherent, and the directive is to treat it as **one scope** delivered in dependency order — "it's okay to have a massive implementation plan; we can deliver quickly and effectively." Dependencies between capabilities are a **build order**, not a version ladder.

### Decision
**Scope = the entire designed surface.** Every plan in the suite ([Plan 0](../vision.md#plan-00)–[Plan 47](../governance-planes.md#plan-47)) is in scope.

1. **No release split, no deferred bucket.** There is no "next version" and no "post-launch" tier: the Forge, multi-region HA, FinOps showback, the full dashboard, platform-engineer Resource Definitions/Matching/Packs at depth, the Operator Crew, the generated stack (infrastructure **and** app/UI), patchability, SRE/incident-management, and the governance planes (compliance enforcement, AI safety) + the `notify` port + Registry distribution are all in scope. Scope is bounded only by [ADR-0064](#adr-0064) (AI-native meta-cloud: no business/monetization).
2. **Build stages = dependency order.** The build proceeds foundations → SDK-local → first-deploy(+gates) → AI-native → multi-provider → Forge → HA/FinOps/UX/planes ([Per-stage build detail](../roadmap.md#per-stage-build-detail-stages-06)). Stages are *how* a large surface is delivered in order; they are not separate versions. Definition of done = every stage's acceptance gate green ([PRD §9](../../requirements/PRD.md)).
3. **Priority = build order.** MoSCoW on requirements ([BRD §8](../../requirements/BRD.md)/[PRD §6](../../requirements/PRD.md)) expresses **build priority/sequencing**, not a release boundary.
4. **Anti-goals are positioning, not deferrals.** HoBo **composes** IaC engines (Pulumi/Terraform/OpenTofu/Crossplane) via the IaC port rather than replacing them ([Plan 3](../control-plane.md#plan-03)); it is not a standalone secret-management product or a generic app framework ([00 non-goals](../vision.md#plan-00)).

Genuine *technical* first-cut scoping inside individual capability designs (e.g. provider-store active-active/CDC, the multi-Yard **Junction** [ADR-0043](07-portability-extensibility.md#adr-0043), incremental view maintenance, full ITSM) remain honest "first implementation" notes and **iteration hooks** — in scope, sequenced by the build.

### Consequences
- **(+)** One unambiguous scope: "everything designed." No per-feature "which version?" question; the roadmap is a build sequence.
- **(+)** The breadth planes (governance, AI safety, comms, marketplace, HA, FinOps, app generation) are committed, not aspirational — they ride existing machinery (ports, policy, events, conformance) with no new runtime.
- **(−)** A **large** surface; delivery risk concentrates in execution sequencing. Mitigation: build stages are independently demoable and each keeps prior acceptance gates green, so progress is continuously verifiable.
- **(−)** Several NFR baselines ([ADR-0021](#adr-0021)) can only be fully measured once the late stages (multi-region HA) exist; earlier stages verify them on representative-but-partial setups.

## ADR-0064
**Scope: AI-native meta-cloud (remove business/monetization; keep app generation).**

### Context
HoBo is an **AI-native meta-cloud** — a direct competitor to **Convex, Lakebed.dev, and Nitric**: a portable durable runtime + a cloud-agnostic provisioning control plane that any cloud's primitives plug into via ports, operable by agents, with the **Forge** generating the missing adapters. The one kind of scope that drifts past a meta-cloud is **SaaS-business functions** — billing, subscriptions, invoicing, tax/VAT, chargeback, monetization, rev-share. HoBo is not a payments/billing product, and a meta-cloud should not carry a commercial toolkit.

### Decision
**Scope HoBo to the meta-cloud, minus money-movement.** The test for a capability: ***would Convex, Nitric, or Lakebed ship this as a platform capability?*** *developer-facing ≠ out of scope* — these competitors are batteries-included; the cut line is **business/monetization**, not "non-developer" and not app generation.

1. **Keep** (in scope): cloud/infra orchestration; the durable, event-sourced runtime; AI-native agents + MCP; the **Forge** (AI-generated providers/adapters/implementations behind ports) and self-optimizing runtime functions (`"use training"`); the developer-facing **cloud primitives** (data, reactivity, auth, search, messaging, storage) as ports; and **app generation** — the **UX Designer** operator, **design.md** as a required input, **OpenUI**, **json-render**, and **mcp-apps**, plus the app/UI layer of the generated stack and the `ui-render` port ([ADR-0055](06-ai-generation-operators.md#adr-0055)/[ADR-0056](06-ai-generation-operators.md#adr-0056)). Cloud-cost **FinOps** (estimates/budgets/showback/quotas/spend-safety) stays — it is infra, not money.
2. **Remove — business/monetization only:** the `billing` port / chargeback / invoicing / tax / rev-share / subscriptions; the marketplace's monetize lifecycle. ADR-0039 is **Metering, quota & cost attribution** (FinOps only).
3. **Consolidate:** `notify` (email/sms/push/webhook) is a thin **cloud-messaging port** in the resource catalog, not a standalone plane; the marketplace's publish/discover/install/trust folds into the **Registry** + **Resource Packs**; governance planes (compliance, AI safety) keep their **enforcement** machinery.

### Alternatives considered
- **Keep monetization as a differentiator.** Rejected: pushes HoBo from a meta-cloud into a SaaS-business product, blurring the Convex/Lakebed/Nitric positioning and adding commercial surface unrelated to the thesis.
- **Cut app/UI generation too.** Rejected: AI-generating the app (UI **and** infrastructure) from intent is core to the AI-native thesis and is a batteries-included capability competitors ship; only money-movement is out.

### Consequences
- **(+)** Sharp, defensible identity: agnostic IfC + durable event-sourced runtime + agents/Forge + conformance + patchability + **app generation**; only the business sprawl leaves.
- **(+)** Clear competitive story vs Convex/Lakebed/Nitric; no first-party commercial toolkit to maintain (commercialization is out of design scope).
- **(↔)** Money-movement terms are removed across the suite; metering/showback/quota/spend-safety (FinOps) and the app-generation stack (UX Designer/design.md/OpenUI/json-render/mcp-apps/`ui-render`) stay.

## Open / proposed decisions (ADR-Pn)
- **ADR-P1:** consensus for the built-in engine (own Raft vs delegate to the Camp's runtime store) — [Plan 5](../reliability-observability-cost.md#plan-05).
- **ADR-P2:** overlay-mesh technology for cross-provider connectivity — [Plan 13](../security-networking.md#plan-13).
- **ADR-P3:** ~~policy language for guardrails/ABAC~~ — **Resolved by ADR-0015** (typed TS default; OPA/Cedar optional providers behind the `policy-engine` port).
- **ADR-P4:** ~~default Planner objective (cost-first vs latency-first)~~ — **Resolved by [ADR-0033](05-config-matching-environments.md#adr-0033)**: configurable `cost`|`latency`|`single-provider`|`carbon`, **default min-cost within constraints**, applied as a deterministic lexicographic tiebreak (no on-path solver/LLM) — [Plan 16](../reliability-observability-cost.md#plan-16)/[Plan 25](../platform-engineering.md#plan-25).
- **ADR-P5:** documented default for the workflow directive vs wrapper (compiler transform depth) — [Plan 2](../sdk-api.md#plan-02).
