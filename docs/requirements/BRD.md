# HoBo — Business Requirements Document (BRD)

> Part of the [HoBo Requirements Suite](./README.md). **Why** we are building HoBo: the business problem, market, objectives, model, and the business-level requirements (`BR-NNN`) that the [PRD](./PRD.md) and [TRD](./TRD.md) must satisfy. Cites the [design suite](../design/README.md) rather than restating it.

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
| Related | [PRD](./PRD.md), [TRD](./TRD.md), [00 Vision](../design/00-vision.md), [17 Positioning](../design/17-positioning-competitive.md), [08 Roadmap](../design/08-roadmap.md), [16 Cost/FinOps](../design/16-cost-finops.md) |

### 1.1 RACI (business decisions)
| Activity | Founders | Product | Eng | Platform | GTM |
|---|---|---|---|---|---|
| Business objectives & KPIs | **A** | R | C | C | C |
| Monetization model ([ADR-0020](../design/adr/ADR-0020-monetization-model.md)) | **A/R** | C | C | I | C |
| ICP / persona priority ([ADR-0019](../design/adr/ADR-0019-persona-prioritization-icp.md)) | A | **R** | C | C | C |
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

**HoBo** is an AI-native, cloud-agnostic **control plane** plus a TypeScript SDK: *"Write your app once in TypeScript. HoBo decides how to host it — and gets out of the way when you want control. Built for humans and the agents that work for them."* ([00-vision.md](../design/00-vision.md)). It is **not** a single PaaS, **not** "just IaC," and **not** Kubernetes-only ([17-positioning-competitive.md](../design/17-positioning-competitive.md)).

The business bet: own the intersection no incumbent occupies — cloud-agnostic ports/adapters (as WIT worlds) + a durable, event-sourced runtime + inline `.allow()` infrastructure-from-code + agents-as-first-class + **AI-generated providers** + a self-hostable control plane ([17](../design/17-positioning-competitive.md)). Monetize via an **OSS core + hosted Yard SaaS + a Forge/Resource-Pack marketplace** ([ADR-0020](../design/adr/ADR-0020-monetization-model.md)).

## 3. Business context & problem statement
- **Developer pain:** cloud-specific APIs, IaC sprawl, and operational burden block application developers from shipping; switching clouds means rewrites.
- **Lock-in vs. complexity dilemma:** closed PaaS (e.g. Lakebed) trades control for simplicity; multi-cloud IaC trades simplicity for control. No mainstream option is both simple *and* portable.
- **Agent readiness gap:** existing platforms treat AI agents as bolt-on API clients, not first-class authenticated principals with scoped credentials and audit — so autonomous deploy/operate is unsafe or impossible.
- **Provider-breadth bottleneck:** agnostic platforms depend on communities to write provider adapters; coverage lags demand.

## 4. Business objectives (SMART)
| ID | Objective | Measure | Target horizon |
|---|---|---|---|
| OBJ-1 | Prove agnostic deploy is tractable | A single unedited Bindle deploys to ≥2 clouds | P4 |
| OBJ-2 | Prove AI-native operation is safe | An agent completes deploy/operate via MCP using only brokered tokens, fully audited | P3 |
| OBJ-3 | Break the provider-breadth bottleneck | `hobo forge <url>` yields a conformance-passing provider | P5 |
| OBJ-4 | Establish a revenue line | Hosted Yard in paid preview with ≥N design partners | post-P4 |
| OBJ-5 | Earn developer trust via openness | OSS core self-hostable; "self-host = hosted" demonstrated | P2 |

## 5. Market opportunity & positioning
**Positioning statement** ([17](../design/17-positioning-competitive.md)): *HoBo is an AI-native, cloud-agnostic control plane that maps a single TypeScript app description onto any mix of real providers — agnostic by default, optimizable on demand, and operable by agents end to end.*

**The gap HoBo fills:** *"No one combines cloud-agnostic ports/adapters (as WIT worlds) + a wasm-default polyglot runtime + a Vercel-grade durable runtime + Nitric-style IfC/`.allow()` + Aspire-style wiring + agents-as-first-class + AI-generated providers AND implementations + a self-hostable control plane. That intersection is HoBo."* ([17](../design/17-positioning-competitive.md)).

## 6. Competitive analysis
From [17-positioning-competitive.md](../design/17-positioning-competitive.md) and the [`competitors/`](../../competitors/README.md) captures:

| Competitor | Their position | HoBo's edge |
|---|---|---|
| **Nitric** | Cloud-agnostic Infrastructure-from-Code | + durable workflows, agents-first, Forge, event-sourced replay, wasm-first ([competitors/nitric](../../competitors/nitric/README.md)) |
| **.NET Aspire** | Code-first composition + local orchestration | + cloud-agnostic multi-provider, Resource Definitions/Matching, event sourcing, agent ops ([competitors/aspire](../../competitors/aspire/README.md)) |
| **Humanitec** | Platform Orchestrator for IDPs (K8s-centric) | + wasm/OCI runtime, event-sourced audit, OSS core, Forge-generated definitions ([competitors/humanitec](../../competitors/humanitec/README.md)) |
| **Convex** | Reactive TypeScript backend-as-a-service | Adjacent; Convex could be a HoBo *capability provider* ([competitors/convex](../../competitors/convex/README.md)) |
| **shoo.dev** | Zero-config Google-sign-in broker | Adjacent (identity); HoBo adds workload/agent identity + token brokering ([competitors/shoo](../../competitors/shoo/README.md)) |
| **Lakebed** | Agent-native closed PaaS | Single closed runtime; HoBo is multi-cloud, multi-runtime, self-hostable |
| **Vercel + Workflow SDK** | PaaS + durable execution | HoBo adopts Worlds for runtime portability; adds multi-provider + IfC + self-host |

**Defensible differentiators** ([17](../design/17-positioning-competitive.md)): AI-native operations; the Hobo Code standard + Registry + Forge (no community bottleneck); event-sourced everything; genuine agnostic + typed escape hatch in one model; contracts/policy/evals as native graph artifacts.

**Who HoBo is *not* for:** single-cloud teams happy with native tooling; pure-Kubernetes shops on Crossplane/KubeVela; bare-metal/extreme-perf workloads where any abstraction is a liability.

## 7. Stakeholders
| Stakeholder | Role | Interest |
|---|---|---|
| **Application developer** (primary ICP) | Writes the Bindle in TypeScript | Write-once, deploy-anywhere; minutes-to-deploy; no cloud lock-in |
| **AI agent** (co-primary; agent-as-user) | Deploys/operates via MCP | First-class identity, scoped credentials, audit, self-service capability discovery |
| **Platform engineer** (secondary) | Authors Resource Definitions, mapping rules, policy/cost guardrails | Governance, standardization, least-privilege, cost control |
| **Operator / SRE** | Runs (or self-hosts) the Yard | Reliability, observability, DR, incident response |
| **Hosted-tenant buyer** (deferred) | Buys the hosted Yard | Managed HA, SSO/RBAC, billing/chargeback, support SLA |
Persona priority is fixed by [ADR-0019](../design/adr/ADR-0019-persona-prioritization-icp.md).

## 8. Business requirements (`BR-NNN`)
> Priority: **M**ust / **S**hould / **C**ould / **W**on't-v1 ([ADR-0022](../design/adr/ADR-0022-mvp-scope-moscow.md)). Each maps forward to PRD `FR`/`NFR` (see [TRD traceability](./TRD.md#traceability-matrix)).

| ID | Business requirement | Priority | Rationale / source |
|---|---|---|---|
| **BR-001** | A developer authors an app **once** in TypeScript and deploys it to real cloud infrastructure without cloud-specific code. | M | Core value prop ([00](../design/00-vision.md)) |
| **BR-002** | The **same** unedited app description deploys to **multiple** providers; switching/splitting clouds touches config only. | M | OBJ-1; agnostic thesis ([03](../design/03-providers-iac.md)) |
| **BR-003** | Developers can **optimize per-provider on demand** without losing portability (typed escape hatch). | M | "optimizable on demand" ([ADR-0007](../design/adr/README.md)) |
| **BR-004** | **AI agents are first-class users**: every capability is reachable via SDK, CLI, **and** MCP with first-class agent identity. | M | OBJ-2; agents-as-users ([06](../design/06-ai-native-agent-auth.md)) |
| **BR-005** | Provider access uses **brokered/federated short-lived credentials**, not static secrets (zero-secret default). | M | Trust/security; OBJ-2 ([06](../design/06-ai-native-agent-auth.md)/[12](../design/12-security-multitenancy.md)) |
| **BR-006** | Every business-relevant action (deploy, token grant/use/revoke, spend approval, policy decision) is **auditable and replayable**. | M | Compliance, trust ([11](../design/11-event-model.md)/[12](../design/12-security-multitenancy.md)) |
| **BR-007** | HoBo is **self-hostable**; the hosted offering runs the same code ("self-host = hosted"). | M | OBJ-5; openness ([00](../design/00-vision.md)/[04](../design/04-control-plane.md)) |
| **BR-008** | Missing provider coverage can be filled **without waiting on a community** (AI-generated, conformance-gated). | S | OBJ-3; Forge moat ([06](../design/06-ai-native-agent-auth.md)/[23](../design/23-stubbable-ai-implementations.md)) |
| **BR-009** | **Cost is a first-class business input**: plan-time estimates, budgets/caps, and showback per tenant/Bindle/Camp. | S→C | FinOps ([16](../design/16-cost-finops.md)) |
| **BR-010** | The platform supports **governance** (policy, approvals, data-residency/region constraints) suitable for regulated adopters. | C | Platform-engineer persona ([12](../design/12-security-multitenancy.md)/[30](../design/30-policy-plane.md)) |
| **BR-011** | The platform must be **safe to operate autonomously**: high-risk agent/automation actions are gated (approval, spend caps). | M | Trust; risk control ([06](../design/06-ai-native-agent-auth.md)/[30](../design/30-policy-plane.md)) |
| **BR-012** | Monetization follows the **OSS core + hosted Yard + marketplace** model; portability is never paywalled. | M | [ADR-0020](../design/adr/ADR-0020-monetization-model.md) |

## 9. Business model & pricing
Per [ADR-0020](../design/adr/ADR-0020-monetization-model.md):
1. **OSS core** — SDK, runtime, built-in World, conformance, CLI, self-hostable Yard (drives adoption; required by the agnostic promise).
2. **Hosted Yard (SaaS)** — primary revenue: managed HA/multi-region, showback→**chargeback/billing**, org SSO/RBAC, audit retention, support SLAs, hosted Forge. *Pricing model:* per-seat and/or usage; **figures TBD** (see Assumptions).
3. **Marketplace** — signed, conformance-passing Forge providers and platform-engineer Resource Packs ([27](../design/27-drivers-packs-profiles.md)); monetization secondary.
We do **not** mark up the customer's cloud spend and do **not** gate portability — both would break the core thesis.

## 10. Success metrics & KPIs
North-star signals from [08-roadmap.md](../design/08-roadmap.md), made measurable in [ADR-0021](../design/adr/ADR-0021-nfr-baselines-slos.md):
| KPI | Target | Tied to |
|---|---|---|
| Time-to-first-deploy | minutes, not hours (≤10 min p50) | BR-001 |
| "Same Bindle, N clouds" | ≥2 at v1, design target N | BR-002 |
| Zero-secret rate | ~100% (≥99%) | BR-005 |
| Agent-completable lifecycle | % of deploy/operate tasks an agent does unaided via MCP | BR-004 |
| Forge yield | % of requested providers auto-generated that pass conformance | BR-008 |
| Recovery (resume after node loss / rebuild) | <30 s resume / <15 min rebuild | BR-006/BR-007 |

## 11. Scope
**In scope (v1, P0–P4 — [ADR-0022](../design/adr/ADR-0022-mvp-scope-moscow.md)):** agnostic authoring + runtime; the Yard control plane; ≥2 providers; keyless agent identity + MCP; Hobo Code + Registry; conformance trust boundary; cross-provider connectivity.
**In scope (post-v1, P5–P6):** Forge at scale; full FinOps/budgets/chargeback; multi-region HA; complete dashboard; platform-engineer Resource Definitions/Matching/Packs at depth.
**Out of scope (v1)** ([00 non-goals](../design/00-vision.md)): a general PaaS UI for non-developers; replacing Terraform/Pulumi (we orchestrate them); supporting every cloud on day one; being an application framework or a standalone secret-management product.

## 12. Assumptions
- AI agents (via MCP) are a growing, real channel for software delivery — central to the bet.
- Providers will (eventually) publish, or accept Forge-generated, machine-readable Hobo Code; v1 ships first-party signs for launch providers.
- The OSS license split and exact hosted pricing are **open** and will be ratified before paid GA (tracked as risks).

## 13. Constraints
- **Agnostic constraint:** no design choice may make the core un-runnable off our cloud (would break BR-002/BR-007).
- **Security constraint:** the conformance suite is the trust boundary for all (esp. AI-generated) adapters; nothing ships uncertified ([09](../design/09-verification-open-questions.md)/[12](../design/12-security-multitenancy.md)).
- **Resourcing:** the roadmap is phase-gated; risky bets (Forge, multi-region HA) deliberately follow a proven core ([08](../design/08-roadmap.md)).

## 14. Dependencies
- Upstream ecosystems: WASI/Component Model + WIT, Pulumi Automation API, SPIFFE/OIDC, MCP. Churn in these (esp. `wasi:*` drafts) is a tracked risk ([09](../design/09-verification-open-questions.md)).
- Cloud provider federation/STS capabilities for keyless tokens (per-provider trust setup).

## 15. Risk register
| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R-1 | **Forge yields insecure/low-quality providers** | Med | High | Conformance + sandbox-no-egress + signing/provenance + human gate for high-trust ([12](../design/12-security-multitenancy.md)/[23](../design/23-stubbable-ai-implementations.md)) | Eng |
| R-2 | **Agent autonomy causes runaway spend/destroy** | Med | High | Scoped SVIDs, policy gates, spend caps, full replay ([06](../design/06-ai-native-agent-auth.md)/[30](../design/30-policy-plane.md)) | Eng/Platform |
| R-3 | **Scope/complexity overwhelms the team** (broad surface) | High | High | Phase gates; MVP line at P4; "powerful but unusable" guardrail ([ADR-0022](../design/adr/ADR-0022-mvp-scope-moscow.md)) | Product |
| R-4 | **OSS/commercial line wrong** → no revenue or no adoption | Med | High | Explicit model ([ADR-0020](../design/adr/ADR-0020-monetization-model.md)); ratify license + pricing pre-GA | Founders |
| R-5 | **Upstream churn** (`wasi:*`, Pulumi, MCP) breaks assumptions | Med | Med | Ports/adapters isolate churn; pin + conformance ([24](../design/24-wit-worlds-reference.md)) | Eng |
| R-6 | **Multi-cloud networking** harder/costlier than modeled | Med | Med | Tiered connectivity + egress feedback to Planner ([13](../design/13-networking-connectivity.md)/[16](../design/16-cost-finops.md)) | Eng |
| R-7 | **Incumbents add agnostic/agent features** | Med | Med | Move fast on the unique intersection; OSS + Forge moat ([17](../design/17-positioning-competitive.md)) | Founders/GTM |

## 16. Roadmap as business milestones
From [08-roadmap.md](../design/08-roadmap.md):
| Phase | Business milestone | Exit criterion |
|---|---|---|
| P0–P1 | Developer SDK works locally (agnostic authoring) | hello-bindle runs offline; replay == live state |
| P2 | **MVP production:** first cloud + Yard | deploys to a real cloud + survives Yard restart |
| P3 | **Agent autonomy:** keyless agent deploy | agent deploys via MCP using only brokered tokens |
| P4 | **Multi-cloud thesis proved (v1 GA line):** one Bindle, ≥2 clouds | multi-cloud example runs; cross-cloud mTLS works |
| P5 | **Extensibility moat:** Forge | `hobo forge <url>` yields a certified provider |
| P6 | **Production hardened:** HA + FinOps + UX | canary auto-rollback; cost within tolerance; DR < RTO |

## 17. References
[00 Vision](../design/00-vision.md) · [08 Roadmap](../design/08-roadmap.md) · [16 Cost/FinOps](../design/16-cost-finops.md) · [17 Positioning](../design/17-positioning-competitive.md) · [`competitors/`](../../competitors/README.md) · [PRD](./PRD.md) · [TRD](./TRD.md) · ADRs [0018](../design/adr/ADR-0018-requirements-structure-and-traceability.md)/[0019](../design/adr/ADR-0019-persona-prioritization-icp.md)/[0020](../design/adr/ADR-0020-monetization-model.md)/[0021](../design/adr/ADR-0021-nfr-baselines-slos.md)/[0022](../design/adr/ADR-0022-mvp-scope-moscow.md).
