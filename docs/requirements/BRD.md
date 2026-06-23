# HoBo — Business Requirements Document (BRD)

> Part of the [HoBo Requirements Suite](./README.md). **Why** we are building HoBo: the business problem, market, objectives, and the business-level requirements (`BR-NNN`) that the [PRD](./PRD.md) and [TRD](./TRD.md) must satisfy. Cites the [design suite](../design/README.md) rather than restating it.

## 1. Document control

| Field | Value |
|---|---|
| Title | HoBo Business Requirements Document |
| Version | 0.1 (Draft for review) |
| Date | 2026-06-20 |
| Status | Draft |
| Owner (Accountable) | Founders / Business lead |
| Authors | Product + Business |
| Reviewers | Engineering lead, Platform lead, GTM |
| Related | [PRD](./PRD.md), [TRD](./TRD.md), [00 Vision](../design/vision.md#plan-00), [17 Positioning](../design/positioning.md#plan-17), [08 Roadmap](../design/roadmap.md#plan-08), [16 Cost/FinOps](../design/reliability-observability-cost.md#plan-16) |

### 1.1 RACI (business decisions)
| Activity | Founders | Product | Eng | Platform | GTM |
|---|---|---|---|---|---|
| Business objectives & KPIs | **A** | R | C | C | C |
| ICP / persona priority ([ADR-0019](../design/adr/08-scope-and-requirements.md#adr-0019)) | A | **R** | C | C | C |
| Scope (in/out) & roadmap | A | **R** | C | C | I |
| Risk acceptance | **A** | R | C | C | C |

*(R = Responsible, A = Accountable, C = Consulted, I = Informed.)*

### 1.2 Sign-off
| Role | Name | Decision | Date |
|---|---|---|---|
| Founder / Business | _TBD_ | ☐ Approve ☐ Changes | |
| Product lead | _TBD_ | ☐ Approve ☐ Changes | |
| Engineering lead | _TBD_ | ☐ Approve ☐ Changes | |
| Platform lead | _TBD_ | ☐ Approve ☐ Changes | |

## 2. Executive summary
Shipping software still forces application developers to become part-time platform engineers — picking clouds, wiring IaC, designing for HA, and operating infrastructure ([design README §Context](../design/README.md)). Today's tools force a bad trade: an opinionated closed PaaS (simple but locked-in) **or** raw multi-cloud IaC (powerful but heavy). Neither is built for the emerging world where **AI agents are primary builders and deployers**.

**HoBo** is an **AI-native meta-cloud** — a cloud-agnostic **control plane** plus a TypeScript SDK: *"Write your app once in TypeScript. HoBo decides how to host it — and gets out of the way when you want control. Built for humans and the agents that work for them."* ([vision.md#plan-00](../design/vision.md#plan-00)). It is **not** a single PaaS, **not** "just IaC," and **not** Kubernetes-only ([positioning.md#plan-17](../design/positioning.md#plan-17)).

The bet: own the intersection no incumbent occupies — cloud-agnostic ports/adapters (as WIT interfaces) + a durable, event-sourced runtime + inline `.allow()` infrastructure-from-code + agents-as-first-class + **AI-generated providers** + a self-hostable control plane ([17](../design/positioning.md#plan-17)).

## 3. Business context & problem statement
- **Developer pain:** cloud-specific APIs, IaC sprawl, and operational burden block application developers from shipping; switching clouds means rewrites.
- **Lock-in vs. complexity dilemma:** closed PaaS (e.g. Lakebed) trades control for simplicity; multi-cloud IaC trades simplicity for control. No mainstream option is both simple *and* portable.
- **Agent readiness gap:** existing platforms treat AI agents as bolt-on API clients, not first-class authenticated principals with scoped credentials and audit — so autonomous deploy/operate is unsafe or impossible.
- **Provider-breadth bottleneck:** agnostic platforms depend on communities to write provider adapters; coverage lags demand.

## 4. Business objectives (SMART)
All objectives are part of the single v1 ([ADR-0063](../design/adr/08-scope-and-requirements.md#adr-0063)); the milestone column names the **v1 build stage** ([per-stage build detail](../design/roadmap.md#per-stage-build-detail-stages-06)) by which each is demonstrable, not a separate release.
| ID | Objective | Measure | v1 build milestone |
|---|---|---|---|
| OBJ-1 | Prove agnostic deploy is tractable | A single unedited Bindle deploys to ≥2 clouds | stage 4 |
| OBJ-2 | Prove AI-native operation is safe | An agent completes deploy/operate via MCP using only brokered tokens, fully audited | stage 3 |
| OBJ-3 | Break the provider-breadth bottleneck | `hobo forge <url>` yields a conformance-passing provider | stage 5 |
| OBJ-5 | Earn developer trust via openness | OSS core self-hostable; "self-host = hosted" demonstrated | stage 2 |

## 5. Market opportunity & positioning
**Positioning statement** ([17](../design/positioning.md#plan-17)): *HoBo is an AI-native meta-cloud — a cloud-agnostic control plane (WIT/WASM surface; TypeScript the first reference implementation) that maps one app description onto any mix of real providers — agnostic by default, optimizable on demand, and operable by agents end to end.*

**The gap HoBo fills:** *"No one combines cloud-agnostic ports/adapters (as WIT interfaces) + a wasm-default polyglot runtime + a Vercel-grade durable runtime + Nitric-style IfC/`.allow()` + Aspire-style wiring + agents-as-first-class + AI-generated providers AND implementations + a self-hostable control plane. That intersection is HoBo."* ([17](../design/positioning.md#plan-17)).

## 6. Competitive analysis
From [positioning.md#plan-17](../design/positioning.md#plan-17) and the [`competitors/`](../../competitors/README.md) captures:

| Competitor | Their position | HoBo's edge |
|---|---|---|
| **Convex** | Reactive TypeScript backend-as-a-service | + multi-cloud portability, durable event-sourced runtime, agents-first, Forge ([competitors/convex](../../competitors/convex.md)) |
| **Nitric** | Cloud-agnostic Infrastructure-from-Code | + durable workflows, agents-first, Forge, event-sourced replay, wasm-first ([competitors/nitric](../../competitors/nitric.md)) |
| **Lakebed** | Agent-native closed PaaS | Single closed runtime; HoBo is multi-cloud, multi-runtime, self-hostable |
| **.NET Aspire** | Code-first composition + local orchestration | + cloud-agnostic multi-provider, Resource Definitions/Matching, event sourcing, agent ops ([competitors/aspire](../../competitors/aspire.md)) |
| **Humanitec** | Platform Orchestrator for IDPs (K8s-centric) | + wasm/OCI runtime, event-sourced audit, OSS core, Forge-generated definitions ([competitors/humanitec](../../competitors/humanitec.md)) |
| **shoo.dev** | Zero-config Google-sign-in broker | Adjacent (identity); HoBo adds workload/agent identity + token brokering ([competitors/shoo](../../competitors/shoo.md)) |
| **Vercel + Workflow SDK** | PaaS + durable execution | HoBo provides its own HoBo-native durable runtime (per Camp) for portability; adds multi-provider + IfC + self-host |

**Defensible differentiators** ([17](../design/positioning.md#plan-17)): AI-native operations; the Capability Manifest standard + Registry + Forge (no community bottleneck); event-sourced everything; genuine agnostic + typed escape hatch in one model; contracts/policy/evals as native graph artifacts.

**Who HoBo is *not* for:** single-cloud teams happy with native tooling; pure-Kubernetes shops on Crossplane/KubeVela; bare-metal/extreme-perf workloads where any abstraction is a liability.

## 7. Stakeholders
| Stakeholder | Role | Interest |
|---|---|---|
| **Application developer** (primary ICP) | Writes the Bindle in TypeScript | Write-once, deploy-anywhere; minutes-to-deploy; no cloud lock-in |
| **AI agent** (co-primary; agent-as-user) | Deploys/operates via MCP | First-class identity, scoped credentials, audit, self-service capability discovery |
| **Platform engineer** (secondary) | Authors Resource Definitions, mapping rules, policy/cost guardrails | Governance, standardization, least-privilege, cost control |
| **Operator / SRE** | Runs (or self-hosts) the Yard | Reliability, observability, DR, incident response |
| **Hosted-tenant operator** | Runs (or uses) a managed Yard | Managed HA, SSO/RBAC, audit retention, support SLA |
Persona priority is fixed by [ADR-0019](../design/adr/08-scope-and-requirements.md#adr-0019).

## 8. Business requirements (`BR-NNN`)
> All BRs are **v1** ([ADR-0063](../design/adr/08-scope-and-requirements.md#adr-0063)). Priority **M**ust / **S**hould / **C**ould now expresses **build order within v1** (which to nail first), not a release boundary — there is no "Won't-v1" bucket. Each maps forward to PRD `FR`/`NFR` (see [TRD traceability](./TRD.md#traceability-matrix)).

| ID | Business requirement | Priority | Rationale / source |
|---|---|---|---|
| **BR-001** | A developer authors an app **once** in TypeScript and deploys it to real cloud infrastructure without cloud-specific code. | M | Core value prop ([00](../design/vision.md#plan-00)) |
| **BR-002** | The **same** unedited app description deploys to **multiple** providers; switching/splitting clouds touches config only. | M | OBJ-1; agnostic thesis ([03](../design/control-plane.md#plan-03)) |
| **BR-003** | Developers can **optimize per-provider on demand** without losing portability (typed escape hatch). | M | "optimizable on demand" ([ADR-0007](../design/adr/README.md)) |
| **BR-004** | **AI agents are first-class users**: every capability is reachable via SDK, CLI, **and** MCP with first-class agent identity. | M | OBJ-2; agents-as-users ([06](../design/ai-native-agent-auth.md#plan-06)) |
| **BR-005** | Provider access uses **brokered/federated short-lived credentials**, not static secrets (zero-secret default). | M | Trust/security; OBJ-2 ([06](../design/ai-native-agent-auth.md#plan-06)/[12](../design/security-networking.md#plan-12)) |
| **BR-006** | Every business-relevant action (deploy, token grant/use/revoke, spend approval, policy decision) is **auditable and replayable**. | M | Compliance, trust ([11](../design/event-model.md#plan-11)/[12](../design/security-networking.md#plan-12)) |
| **BR-007** | HoBo is **self-hostable**; the hosted offering runs the same code ("self-host = hosted"). | M | OBJ-5; openness ([00](../design/vision.md#plan-00)/[04](../design/control-plane.md#plan-04)) |
| **BR-008** | Missing provider coverage can be filled **without waiting on a community** (AI-generated, conformance-gated). | S | OBJ-3; Forge moat ([06](../design/ai-native-agent-auth.md#plan-06)/[23](../design/forge-generated-stack.md#plan-23)) |
| **BR-009** | **Cost is a first-class input**: plan-time estimates, budgets/caps, and showback per tenant/Bindle/Camp. | S→C | FinOps ([16](../design/reliability-observability-cost.md#plan-16)) |
| **BR-010** | The platform supports **governance** (policy, approvals, data-residency/region constraints) suitable for regulated adopters. | C | Platform-engineer persona ([12](../design/security-networking.md#plan-12)/[30](../design/contracts-policy-flags.md#plan-30)) |
| **BR-011** | The platform must be **safe to operate autonomously**: high-risk agent/automation actions are gated (approval, spend caps). | M | Trust; risk control ([06](../design/ai-native-agent-auth.md#plan-06)/[30](../design/contracts-policy-flags.md#plan-30)) |

## 9. Business model
HoBo is **open-source**. Commercialization (pricing, billing, invoicing, tax) is **out of scope of these design docs** ([ADR-0064](../design/adr/08-scope-and-requirements.md#adr-0064)) — HoBo is a meta-cloud, not a SaaS-business toolkit. An optional managed/hosted Yard may exist operationally (managed HA, org SSO/RBAC, audit retention, support), but it ships the **same code** as self-host and **never gates portability** ([ADR-0024](../design/adr/07-portability-extensibility.md#adr-0024)); HoBo never marks up the customer's cloud spend.

## 10. Success metrics & KPIs
North-star signals from [roadmap.md#plan-08](../design/roadmap.md#plan-08), made measurable in [ADR-0021](../design/adr/08-scope-and-requirements.md#adr-0021):
| KPI | Target | Tied to |
|---|---|---|
| Time-to-first-deploy | minutes, not hours (≤10 min p50) | BR-001 |
| "Same Bindle, N clouds" | ≥2 at v1, design target N | BR-002 |
| Zero-secret rate | ~100% (≥99%) | BR-005 |
| Agent-completable lifecycle | % of deploy/operate tasks an agent does unaided via MCP | BR-004 |
| Forge yield | % of requested providers auto-generated that pass conformance | BR-008 |
| Recovery (resume after node loss / rebuild) | <30 s resume / <15 min rebuild | BR-006/BR-007 |

## 11. Scope
**In scope (the whole designed surface, [ADR-0063](../design/adr/08-scope-and-requirements.md#adr-0063)):** agnostic authoring + runtime; the Yard control plane; ≥2 providers; keyless agent identity + MCP; Capability Manifest + Registry; conformance trust boundary; cross-provider connectivity; **the Forge; cloud-cost FinOps (estimates/budgets/showback); multi-region HA; the complete dashboard; platform-engineer Resource Definitions/Matching/Packs at depth; the Operator Crew, the generated stack (infrastructure + app/UI), patchability, SRE/incident management; and the governance planes (compliance & data governance, AI safety/model governance).** Delivered in dependency-ordered build stages ([per-stage build detail](../design/roadmap.md#per-stage-build-detail-stages-06)) — there is no deferred release.
**Out of scope** ([ADR-0064](../design/adr/08-scope-and-requirements.md#adr-0064) + [00 non-goals](../design/vision.md#plan-00)): **SaaS-business functions** (billing/subscriptions/invoicing/tax/chargeback/monetization). HoBo **composes** Terraform/Pulumi/OpenTofu via the IaC port rather than replacing them; it is not a standalone secret-management product or a generic application framework. Broad cloud coverage is delivered **on demand via the Forge** rather than pre-enumerating every cloud.

## 12. Assumptions
- AI agents (via MCP) are a growing, real channel for software delivery — central to the bet.
- Providers will (eventually) publish, or accept Forge-generated, machine-readable Capability Manifest; v1 ships first-party signs for launch providers.

## 13. Constraints
- **Agnostic constraint:** no design choice may make the core un-runnable off our cloud (would break BR-002/BR-007).
- **Security constraint:** the conformance suite is the trust boundary for all (esp. AI-generated) adapters; nothing ships uncertified ([09](../design/verification.md#plan-09)/[12](../design/security-networking.md#plan-12)).
- **Resourcing:** v1 is one large scope delivered in dependency-ordered build stages; risky bets (Forge, multi-region HA) deliberately follow a proven core, but all of it is v1 ([08](../design/roadmap.md#plan-08)).

## 14. Dependencies
- Upstream ecosystems: WASI/Component Model + WIT, Pulumi Automation API, SPIFFE/OIDC, MCP. Churn in these (esp. `wasi:*` drafts) is a tracked risk ([09](../design/verification.md#plan-09)).
- Cloud provider federation/STS capabilities for keyless tokens (per-provider trust setup).

## 15. Risk register
| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R-1 | **Forge yields insecure/low-quality providers** | Med | High | Conformance + sandbox-no-egress + signing/provenance + human gate for high-trust ([12](../design/security-networking.md#plan-12)/[23](../design/forge-generated-stack.md#plan-23)) | Eng |
| R-2 | **Agent autonomy causes runaway spend/destroy** | Med | High | Scoped SVIDs, policy gates, spend caps, full replay ([06](../design/ai-native-agent-auth.md#plan-06)/[30](../design/contracts-policy-flags.md#plan-30)) | Eng/Platform |
| R-3 | **Scope/complexity overwhelms the team** (large single-v1 surface) | High | High | Dependency-ordered build stages, each independently demoable + keeping prior acceptance gates green; "powerful but unusable" guardrail ([ADR-0063](../design/adr/08-scope-and-requirements.md#adr-0063)) | Product |
| R-5 | **Upstream churn** (`wasi:*`, Pulumi, MCP) breaks assumptions | Med | Med | Ports/adapters isolate churn; pin + conformance ([24](../design/wasm-runtime-wit.md#plan-24)) | Eng |
| R-6 | **Multi-cloud networking** harder/costlier than modeled | Med | Med | Tiered connectivity + egress feedback to Planner ([13](../design/security-networking.md#plan-13)/[16](../design/reliability-observability-cost.md#plan-16)) | Eng |
| R-7 | **Incumbents add agnostic/agent features** | Med | Med | Move fast on the unique intersection; OSS + Forge moat ([17](../design/positioning.md#plan-17)) | Founders/GTM |

## 16. v1 build milestones
All of v1; the stages are a dependency-ordered build sequence ([08 v1 delivery plan](../design/roadmap.md#plan-08), [per-stage build detail](../design/roadmap.md#per-stage-build-detail-stages-06)), **not** separate releases. v1 GA = every milestone below met.
| v1 build stage | Business milestone | Acceptance |
|---|---|---|
| 0–1 | Developer SDK works locally (agnostic authoring) | hello-bindle runs offline; replay == live state |
| 2 | First cloud + Yard, governance-gated | deploys to a real cloud + survives Yard restart; an unsafe change is blocked |
| 3 | **Agent autonomy:** keyless agent deploy | agent deploys via MCP using only brokered tokens |
| 4 | **Multi-cloud thesis proved:** one Bindle, ≥2 clouds | multi-cloud example runs; cross-cloud mTLS works |
| 5 | **Extensibility moat:** Forge | `hobo forge <url>` yields a certified provider |
| 6 | **Production hardened + breadth:** HA + FinOps + UX + the governance planes | canary auto-rollback; cost within tolerance; DR < RTO; compliance/AI-safety usable |

## 17. References
[00 Vision](../design/vision.md#plan-00) · [08 Roadmap](../design/roadmap.md#plan-08) · [16 Cost/FinOps](../design/reliability-observability-cost.md#plan-16) · [17 Positioning](../design/positioning.md#plan-17) · [`competitors/`](../../competitors/README.md) · [PRD](./PRD.md) · [TRD](./TRD.md) · ADRs [0018](../design/adr/08-scope-and-requirements.md#adr-0018)/[0019](../design/adr/08-scope-and-requirements.md#adr-0019)/[0021](../design/adr/08-scope-and-requirements.md#adr-0021)/[0063](../design/adr/08-scope-and-requirements.md#adr-0063) (single v1 scope) · [0064](../design/adr/08-scope-and-requirements.md#adr-0064).
