# Scope & NFR/SLO targets — consolidated decisions

> Consolidated ADR decisions for **scope & NFR/SLO targets**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0018
**Requirements artifacts (BRD/PRD/TRD) are deferred planning material.**

The formal Business / Product / Technical requirements layer — `BR`/`FR`/`NFR`/`TR` IDs plus the BR→FR/NFR→TR traceability matrix — is **project-planning material kept out of the current design suite**. The design docs are the single source of design truth; the requirements artifacts are **archived** (`archive/requirements/`) and revived when the work is scoped. The design-relevant NFR/SLO targets live in [ADR-0021](#adr-0021); the scope boundary lives in [ADR-0064](#adr-0064).

## ADR-0019
**Primary ICP — the indie developer and the agent acting on their behalf.**

HoBo serves four personas — application developers, platform engineers, operators, and AI agents-as-users ([vision.md#plan-00](../vision.md#plan-00), [ai-native-agent-auth.md#plan-06](../ai-native-agent-auth.md#plan-06)). The **primary ICP is co-primary: the indie/startup developer authoring a Bindle and the AI agent that deploys and operates it via MCP** — so every capability is reachable by both **SDK/CLI and MCP**, with first-class agent identity. The **platform engineer** (Resource Definitions, mapping rules, policy/cost rules — [25](../platform-engineering.md#plan-25)/[30](../contracts-policy-flags.md#plan-29)) and the **multi-tenant hosted operator** are first-class as well; the org-governance mechanism the operator needs — RBAC + mandatory policy rules (deny-ceilings) over HoBo's own control-plane surface — is [ADR-0074](02-identity-security.md#adr-0074) (the *hosted-operator-as-a-business* stays cut, [ADR-0064](#adr-0064)).

## ADR-0021
**NFR / SLO targets.** Proposed — numbers are defaults to ratify, not contractual SLAs.

[reliability-observability-cost.md#plan-05](../reliability-observability-cost.md#plan-05) lists HA targets and [verification](../forge-generated-stack.md#plan-09) needs **measurable** thresholds. These are the targets, each with a verification method:

| Dimension | Target | Verified by |
|---|---|---|
| Time-to-first-deploy (scaffold → running on real cloud) | ≤ 10 min p50 on the happy path | E2E timing test |
| Local dev start (`hobo dev`, no cloud) | ≤ 60 s | [developer-experience.md#plan-07](../developer-experience.md#plan-07); integration test |
| Zero-secret rate (provider access via brokered/federated tokens) | ≥ 99% of provider calls; static keys only via explicit legacy escape hatch | [06](../ai-native-agent-auth.md#plan-06)/[12](../security-networking.md#plan-12); **gated:** a CI/`can-deploy` gate fails when the measured zero-secret rate over the conformance fixture run drops below 99% (the `token.*` audit feeds it) |
| Portability ("same Bindle, N clouds" unedited) | ≥ 2 providers for the reference app, design target N | [04](../control-plane.md#plan-04); **gated:** `multi-cloud-shop` E2E + the [ADR-0024](07-portability-extensibility.md#adr-0024) §1 empty/satisfied-non-portable-surface assertion |
| Control-plane availability | 99.9% single-region / 99.95% multi-region | [05](../reliability-observability-cost.md#plan-05); **observed via** a fault-injection/SLO soak ([ADR-0047](04-governance-verification.md#adr-0047)), not a per-deploy gate |
| Deploy resume after node loss | < 30 s (lease TTL + tail replay) | [05](../reliability-observability-cost.md#plan-05); chaos test |
| RPO | ~0 (sync quorum) / ≤ 5 s (async tier) | [05](../reliability-observability-cost.md#plan-05); **verified by** a DR-replay/chaos test measuring the actual data-loss window |
| RTO (full Yard rebuild from log) | < 15 min | [05](../reliability-observability-cost.md#plan-05); DR replay test |
| Plan-time cost estimate accuracy | within ±20% of a known fixture | [16](../reliability-observability-cost.md#plan-05); cost fixture test |
| Determinism | `replay == live state` for every durable run (hard invariant) | [09](../forge-generated-stack.md#plan-09); determinism test |

**Determinism and zero-secret are hard invariants**, not best-effort. The table distinguishes **gated** dimensions (a CI/`can-deploy` gate blocks on a miss: zero-secret, portability, determinism) from **observed** dimensions (measured by a soak/DR test, not blocked per-deploy: availability, RPO/RTO, cost accuracy) — so the verification column states enforcement honestly. Some numbers (availability, cost accuracy) are measurable only once multi-region HA and the full cost model exist; until then they are verified on representative-but-partial setups.

## ADR-0063
**Scope is the whole designed surface; sequencing and phasing are deferred.**

Everything in the suite ([Plan 0](../vision.md#plan-00)–[Plan 46](../governance-planes.md#plan-46)) is **in scope**, bounded only by [ADR-0064](#adr-0064). There is **no version ladder and no deferred-feature bucket in the design**: the Forge, multi-region HA, FinOps showback, the full dashboard, platform-engineering depth, the Operator Crew, the generated stack (infrastructure **and** app/UI), patchability, SRE/incident management, the governance planes (compliance enforcement, AI safety), the `notify` port, and Registry distribution are all part of the designed surface. They ride existing machinery (ports, policy, events, conformance) with no new runtime.

**Build sequencing and delivery phasing are deferred planning** (archived, `archive/roadmap.md`) — to be scoped later, not part of the current design state. The only architectural anti-goals are positioning, not deferrals: HoBo **composes** IaC engines (Pulumi/Terraform/OpenTofu/Crossplane) via the IaC port rather than replacing them ([Plan 4](../control-plane.md#plan-04)); it is not a standalone secret-management product or a generic app framework ([vision non-goals](../vision.md#plan-00)).

## ADR-0064
**Scope: AI-native meta-cloud (remove business/monetization; keep app generation).**

### Context
HoBo is an **AI-native meta-cloud** — a direct competitor to **Convex, Lakebed.dev, and Nitric**: a portable durable runtime + a cloud-agnostic provisioning control plane that any cloud's primitives plug into via ports, operable by agents, with the **Forge** generating the missing adapters. The one kind of scope that drifts past a meta-cloud is **SaaS-business functions** — billing, subscriptions, invoicing, tax/VAT, chargeback, monetization, rev-share. HoBo is not a payments/billing product, and a meta-cloud should not carry a commercial toolkit.

### Decision
**Scope HoBo to the meta-cloud, minus money-movement.** The test for a capability: ***would Convex, Nitric, or Lakebed ship this as a platform capability?*** *developer-facing ≠ out of scope* — these competitors are batteries-included; the cut line is **business/monetization**, not "non-developer" and not app generation.

1. **Keep** (in scope): cloud/infra orchestration; the durable, event-sourced runtime; AI-native agents + MCP; the **Forge** (AI-generated providers/adapters/implementations behind ports) and self-optimizing runtime functions (`"use training"`); the developer-facing **cloud primitives** (data, reactivity, auth, search, messaging, storage) as ports; and **app generation** — the **UX Designer** operator, **design.md** as a required input, **OpenUI**, **json-render**, and **mcp-apps**, plus the app/UI layer of the generated stack and the `ui-render` port ([ADR-0055](06-ai-generation-operators.md#adr-0055)/[ADR-0056](06-ai-generation-operators.md#adr-0056)). Cloud-cost **FinOps** (estimates/budgets/showback/quotas/spend-safety) stays — it is infra, not money.
2. **Remove — business/monetization only:** the `billing` port / chargeback / invoicing / tax / rev-share / subscriptions; the marketplace's monetize lifecycle. ADR-0039 is **Metering, quota & cost attribution** (FinOps only).
3. **Consolidate:** `notify` (email/sms/push/webhook) is a thin **cloud-messaging port** in the resource catalog, not a standalone plane; the marketplace's publish/discover/install/trust folds into the **Registry** + **Resource Packs**; governance planes (compliance, AI safety) keep their **enforcement** machinery.

### Consequences
- **(+)** Sharp, defensible identity: agnostic IfC + durable event-sourced runtime + agents/Forge + conformance + patchability + **app generation**; only the business sprawl leaves.
- **(+)** Clear competitive story vs Convex/Lakebed/Nitric; no first-party commercial toolkit to maintain (commercialization is out of design scope).
- **(↔)** Money-movement terms are removed across the suite; metering/showback/quota/spend-safety (FinOps) and the app-generation stack (UX Designer/design.md/OpenUI/json-render/mcp-apps/`ui-render`) stay.

## Open / proposed decisions (ADR-Pn)
- **ADR-P1:** consensus for the built-in engine (own Raft vs delegate to the Camp's runtime store) — [Plan 5](../reliability-observability-cost.md#plan-05).
- **ADR-P2:** overlay-mesh technology for cross-provider connectivity — [Plan 12](../security-networking.md#plan-12).
- **ADR-P3:** policy language for ABAC — **Resolved by [ADR-0015](04-governance-verification.md#adr-0015)** (typed TS default; OPA/Cedar optional providers behind the `policy-engine` port).
- **ADR-P4:** default Planner objective — **Resolved by [ADR-0033](05-config-matching-environments.md#adr-0033)**: configurable `cost`|`latency`|`single-provider`|`carbon`, **default min-cost within constraints**, applied as a deterministic lexicographic tiebreak (no on-path solver/LLM) — [Plan 5](../reliability-observability-cost.md#plan-05)/[Plan 25](../platform-engineering.md#plan-25).
- **ADR-P5:** documented default for the workflow directive vs wrapper (compiler transform depth) — [Plan 2](../sdk-api.md#plan-02).
