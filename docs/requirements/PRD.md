# HoBo — Product Requirements Document (PRD)

> Part of the [HoBo Requirements Suite](./README.md). **What** we are building: personas, journeys, functional requirements (`FR-NNN`) and non-functional requirements (`NFR-NNN`). Each requirement traces back to a [BRD](./BRD.md) `BR` and forward to a [TRD](./TRD.md) `TR` (see [traceability matrix](./TRD.md#traceability-matrix)).

## 1. Document control

| Field | Value |
|---|---|
| Title | HoBo Product Requirements Document |
| Version | 0.1 (Draft for review) |
| Date | 2026-06-20 |
| Status | Draft |
| Owner (Accountable) | Product lead |
| Authors | Product + Design + Eng leads |
| Reviewers | Founders, Engineering, Platform, UX, Security |
| Related | [BRD](./BRD.md), [TRD](./TRD.md), [02 SDK](../design/02-sdk-api.md), [06 AI/agent](../design/06-ai-native-agent-auth.md), [07 UI](../design/07-ui-dashboard.md), [15 CLI/DX](../design/15-cli-dx.md), [19 Worked example](../design/19-worked-example.md) |

### 1.1 RACI (product decisions)
| Activity | Product | Founders | Eng | UX | Security |
|---|---|---|---|---|---|
| Persona/journey definition | **A/R** | C | C | C | I |
| Functional scope & priority | **A/R** | C | C | C | C |
| NFR baselines ([ADR-0021](../design/adr/ADR-0021-nfr-baselines-slos.md)) | A | C | **R** | C | C |
| UX requirements | A | I | C | **R** | I |
| Release criteria per phase | **A/R** | C | C | I | C |

### 1.2 Sign-off
| Role | Name | Decision | Date |
|---|---|---|---|
| Product lead | _TBD_ | ☐ Approve ☐ Changes | |
| Engineering lead | _TBD_ | ☐ Approve ☐ Changes | |
| UX lead | _TBD_ | ☐ Approve ☐ Changes | |
| Security lead | _TBD_ | ☐ Approve ☐ Changes | |

## 2. Vision & value proposition
*"Write your app once in TypeScript. HoBo decides how to host it — and gets out of the way when you want control. Built for humans and the agents that work for them."* ([00-vision.md](../design/00-vision.md)). The product realizes six principles: agnostic by default / optimizable on demand; everything replayable; agents are users; ports over platforms; self-host = hosted; conformance is the contract.

## 3. Goals & non-goals
**Goals:** minutes-to-first-deploy; one Bindle to many clouds, unedited; safe autonomous agent operation; openness/self-host; AI-generated providers without a community bottleneck.
**Non-goals (v1)** ([00-vision.md](../design/00-vision.md)): general PaaS UI for non-developers; replacing Terraform/Pulumi; every cloud day one; being an app framework or a standalone secrets product.

## 4. Personas & roles
Priority per [ADR-0019](../design/adr/ADR-0019-persona-prioritization-icp.md).

| Persona | Goals | Pain today | Success looks like |
|---|---|---|---|
| **Dana — indie/startup developer** (primary) | Ship a TS app fast; not learn N cloud APIs; avoid lock-in | IaC sprawl, cloud-specific rewrites | `hobo deploy` lands on a real cloud in minutes; swapping clouds is a config edit |
| **Atlas — AI agent** (co-primary) | Deploy/operate apps on a user's behalf, safely | Treated as a bolt-on API client; static keys; no audit | Obtains scoped tokens, deploys via MCP, self-corrects from logs; every action audited |
| **Priya — platform engineer** (secondary) | Standardize how resources are realized; enforce policy/cost | Bespoke golden paths, drift | Authors Resource Definitions + policy packs; dev teams self-serve within guardrails |
| **Omar — operator/SRE** | Keep the Yard healthy; recover fast | Opaque deploys, manual DR | Event-sourced timeline, drift heal, replay-based DR |

## 5. Primary user journeys
**J1 — Human developer (happy path)** ([15-cli-dx.md](../design/15-cli-dx.md)):
```bash
npx hobo new my-app -t fullstack && cd my-app && hobo dev   # runs locally, no cloud
# edit app code
hobo login && hobo plan --camp prod                         # dry-run: plan + cost + warnings
hobo deploy --camp prod --strategy canary                   # provision + shift traffic
```
**J2 — Agent via MCP** ([06-ai-native-agent-auth.md](../design/06-ai-native-agent-auth.md)): `list_templates → new → plan → deploy (brokered tokens) → inspect_run/tail_logs → self-correct`.
**J3 — Optimize a boundary** ([19-worked-example.md](../design/19-worked-example.md)): split one resource onto a different provider by editing `hobo.config.ts` only — no app-code change.
**J4 — Platform engineer governs** ([25](../design/25-resource-definitions-matching.md)/[30](../design/30-policy-plane.md)): author a Resource Definition + policy pack; matching selects it per environment; high-risk actions require approval.
**J5 — Missing provider** ([06](../design/06-ai-native-agent-auth.md)): `hobo forge <url>` generates + sandbox-certifies a provider, then it's usable like any other.

## 6. Functional requirements (`FR-NNN`)
> Priority M/S/C/W per [ADR-0022](../design/adr/ADR-0022-mvp-scope-moscow.md). Each has acceptance criteria (AC) and a back-trace to `BR`.

### 6.1 Authoring & SDK ([02](../design/02-sdk-api.md), [21](../design/21-resources-catalog.md), [22](../design/22-wiring-manifest.md))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-001** | Declare app topology in a provider-agnostic `bindle.ts` (resources + bindings). | M | A `bindle()` with ≥2 resources + a `bind` compiles and runs on `world-local`. | BR-001 |
| **FR-002** | Resource catalog with inline `.allow()` permissions (IfC), collected at build. | M | `hobo collect` emits a manifest matching a fixture; `.allow()` yields the expected IAM + link + token-scope triple ([09](../design/09-verification-open-questions.md)). | BR-001/BR-005 |
| **FR-003** | Runtime primitives: `step`, `workflow`, `actor`, `saga`, `agent`, `sleep`/`cron`, hooks, streams. | M | hello-bindle runs a workflow + actor + saga; replay == live state. | BR-001/BR-006 |
| **FR-004** | Separate `hobo.config.ts` (where/how) from `bindle.ts` (what). | M | Swapping the mapped provider edits only config ([ADR-0011](../design/adr/README.md)). | BR-002 |
| **FR-005** | Typed provider-specific options via `.with(...)`, inert for non-resolved providers; `require`/`prefer`. | M | The same Bindle resolves to ≥2 providers; `.with()` affects only the resolved one ([09](../design/09-verification-open-questions.md)). | BR-002/BR-003 |
| **FR-006** | Mapping styles: whole-app default, per-tier, per-boundary. | M | Each style deploys the reference app. | BR-002 |

### 6.2 CLI & DX ([15](../design/15-cli-dx.md))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-010** | Core CLI: `new`, `dev`, `build`, `collect`, `plan`, `deploy`, `promote`, `rollback`, `destroy`, `inspect`, `logs`, `drift`, `login`, `registry`, `doctor`. | M | Each command runs on the reference app; `plan` shows plan + cost + warnings. | BR-001 |
| **FR-011** | `hobo dev` runs the full app locally on `world-local` with **zero cloud**. | M | Cold `hobo dev` ≤60 s, no credentials required (NFR-002). | BR-001 |
| **FR-012** | Deployment strategies (`recreate`/`blue-green`/`canary`/`progressive`) selectable per service. | S | Canary regression auto-rolls-back ([05](../design/05-reliability-ha.md)). | BR-006 |
| **FR-013** | Verification CLI: `verify`, `can-deploy`, `explain-failure`, `fix --dry-run`. | S | A producer/consumer skew is blocked with a precise reason ([29](../design/29-contracts-compatibility.md)); `explain-failure` output meets the error-UX bar in NFR-017. | BR-010 |
| **FR-014** | `hobo doctor` runs a **portability + security lint**: warns (non-blocking, explained) on provider lock-in (provider-specific `.with()` for only one provider) and on static-key use where federation is available. | S | doctor flags a single-provider `.with()` resource and a static-key binding with an actionable message ([ADR-0024](../design/adr/ADR-0024-portability-conformance-guarantee.md)/[ADR-0023](../design/adr/ADR-0023-security-posture-commitments.md)). | BR-002/BR-003/BR-005 |

### 6.3 AI-native & agent operation ([06](../design/06-ai-native-agent-auth.md))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-020** | Every CLI/SDK capability has an **MCP** equivalent with the same identity model. | M | An agent drives `plan→deploy→inspect_run` via `@hobo/mcp` ([09](../design/09-verification-open-questions.md)). | BR-004 |
| **FR-021** | Durable `agent()` with tools-as-steps; `ctx.identity` (SVID) + `ctx.token(...)` brokered tokens injected. | M | An agent run is replayable; `token.*` events present. | BR-004/BR-006 |
| **FR-022** | Agent guardrails: `require-approval`/`auto-allow`/`deny`, `spendCapUsd`, destroy protection. | M | A high-risk action blocks on a policy gate; spend over cap requires approval. | BR-011 |
| **FR-023** | Keyless credentials: agents obtain short-lived, resource-scoped provider tokens via OIDC federation (no static keys). | M | A deploy completes with zero static secrets; full grant/use/revoke audit. | BR-005 |

### 6.4 Providers, Registry & Hobo Code ([03](../design/03-providers-iac.md), [06](../design/06-ai-native-agent-auth.md))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-030** | ≥2 cloud providers (e.g. AWS + Azure) implement the capability ports via IaC adapters. | M | The reference app deploys to both; conformance green. | BR-002 |
| **FR-031** | Providers publish machine-readable **Hobo Code** (`capabilities/auth/cost.json`) at a well-known path; the **Registry** indexes it. | M | An agent discovers a capability + auth flow from the Registry. | BR-004/BR-008 |
| **FR-032** | Capability/region/cost-aware **Planner** turns Bindle + mapping into a DeploymentPlan; records rationale. | M | Planner rejects an unsatisfiable `require` with a precise reason; rationale on `deployment.Planned`. | BR-002/BR-009 |

### 6.5 Forge, stubbable & trainable implementations ([06](../design/06-ai-native-agent-auth.md), [23](../design/23-stubbable-ai-implementations.md))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-040** | `stub()` behind any WIT port records calls and returns typed responses so an app runs before impls exist. | S | The reference app runs end-to-end with a stubbed port; calls recorded as events. | BR-008 |
| **FR-041** | **Forge** generates a candidate provider from docs/OpenAPI/Terraform, sandbox-tests against conformance, signs + publishes on pass. | S | `hobo forge <url>` yields a certified provider passing conformance ([09](../design/09-verification-open-questions.md)). | BR-008 |
| **FR-042** | AI implement/evolve/**live-fix**, gated: low-risk auto-canary w/ auto-rollback; prod/high-risk requires approval. | S→C | A simulated SLO regression drives a gated live-fix that auto-rolls-back on failure. | BR-008/BR-011 |
| **FR-043** | **`"use training"`** directive (peer to `"use workflow"`/`"use step"`) marks a method an AI-rewritable semantic function; it carries **intent + contract + rubric** (semantic grounding) and HoBo continuously optimizes it via an **internal `training-engine`** (built-in default; Microsoft Agent Lightning/Trace optional, **not SDK-exposed**). | S | A `"use training"` method missing intent/rubric is linted; a trained candidate promotes only through conformance + eval + policy ([23](../design/23-stubbable-ai-implementations.md), [ADR-0025](../design/adr/ADR-0025-use-training-directive-and-training-engine.md)). | BR-008 |

### 6.6 Governance: contracts, policy, evals, Gatekeeper ([29](../design/29-contracts-compatibility.md), [30](../design/30-policy-plane.md))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-050** | `can-deploy` compatibility gate checks a change against versions running per environment. | S | A producer/consumer skew emits `compat.GateFailed`. | BR-010 |
| **FR-051** | Unified policy decisions (`allow/deny/warn/mutate/require-approval`) with **obligations** as durable effects. | S | A "allow but require canary" obligation is tracked `ObligationCreated→Satisfied`. | BR-010/BR-011 |
| **FR-052** | A single **Gatekeeper** (`hobo verify`) composes contracts + policy + evals + conformance + cost. | S | One explainable, event-sourced decision blocks/permits promote. | BR-006/BR-010 |

### 6.7 Platform-engineering surface ([25](../design/25-resource-definitions-matching.md)–[27](../design/27-drivers-packs-profiles.md))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-060** | Resource Definitions + Matching select *how* a port is realized per context; decision recorded as `match.Decided`. | C | A matching test asserts the expected definition wins with its score ([09](../design/09-verification-open-questions.md)). | BR-010 |
| **FR-061** | Environments via Deployment Sets + Deltas (draft→promote); incremental reconcile of changed nodes. | C | A delta applied yields the expected immutable Set. | BR-010 |
| **FR-062** | Resource Packs (shareable bundles of definitions) installable from the marketplace. | C | A pack installs and its definitions participate in matching. | BR-012 |

### 6.8 Observability & cost ([07](../design/07-ui-dashboard.md), [14](../design/14-observability.md), [16](../design/16-cost-finops.md))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-070** | `hobo plan` returns a projected cost before provisioning; budgets/caps as policy gates; showback per tenant/Bindle/Camp. | S→C | Plan estimate within ±20% of a fixture; a budget breach blocks or requires approval. | BR-009 |
| **FR-071** | Dashboard: deployments timeline (replay/time-travel), topology graph (+ connectivity/cost), run inspector (replay-diff), credential audit, drift. | C | Each view renders for the reference app from projections only. | BR-006/BR-009 |

## 7. Non-functional requirements (`NFR-NNN`)
> The three review lenses — **security, ease-of-use, portability** — are first-class and tagged. Baselines from [ADR-0021](../design/adr/ADR-0021-nfr-baselines-slos.md).

| ID | Category | Requirement | Target / method | BR |
|---|---|---|---|---|
| **NFR-001** | Portability | One **unedited** Bindle deploys to multiple providers; provider details never leak into the agnostic core. "Unedited" = `bindle.ts` + app `src/` byte-identical across targets; only `hobo.config.ts`/env vary. | ≥2 providers at v1; `multi-cloud-shop` E2E asserts identical topology ([ADR-0024](../design/adr/ADR-0024-portability-conformance-guarantee.md), [03](../design/03-providers-iac.md)) | BR-002 |
| **NFR-002** | Ease-of-use | Local dev with zero cloud/credentials. | `hobo dev` ≤60 s cold | BR-001 |
| **NFR-003** | Ease-of-use | Time-to-first-deploy on the happy path. | ≤10 min p50 (E2E timing) | BR-001 |
| **NFR-004** | Ease-of-use | Parity across surfaces: anything in the CLI/SDK is also in MCP. | Surface-parity test ([09](../design/09-verification-open-questions.md)) | BR-004 |
| **NFR-005** | Security | Zero static secrets by default; provider access via short-lived scoped tokens. The legacy static-key escape hatch is **bounded** (max TTL, enforced rotation, fully audited, opt-in). | ≥99% brokered; audit of `token.*`; a key past TTL is rejected ([ADR-0023](../design/adr/ADR-0023-security-posture-commitments.md)) | BR-005 |
| **NFR-006** | Security | Tenant isolation across data/compute/credentials/network/wasm-capability. | Cross-tenant read fails at Gateway + store ([12](../design/12-security-multitenancy.md)) | BR-006 |
| **NFR-007** | Security | AI-generated code is sandboxed (Firecracker + wasm capability, no egress in conformance) and only runs if signed + conformance-passing. | Executor egress test; unsigned plugin refused ([12](../design/12-security-multitenancy.md)) | BR-008 |
| **NFR-008** | Auditability | Every state transition is an append-only event; replayable/time-travelable. | Projection rebuild == live ([11](../design/11-event-model.md)) | BR-006 |
| **NFR-009** | Reliability | Control-plane availability; crash-resume; saga compensation. | 99.9%/99.95%; resume <30 s ([05](../design/05-reliability-ha.md)) | BR-007 |
| **NFR-010** | Recoverability | DR is replay from the log. | RPO ~0/≤5 s; RTO <15 min ([05](../design/05-reliability-ha.md)) | BR-007 |
| **NFR-011** | Determinism | Durable runs replay to identical state. | `replay == live` (hard invariant) | BR-006 |
| **NFR-012** | Cost | Plan-time cost accuracy. | within ±20% of fixture ([16](../design/16-cost-finops.md)) | BR-009 |
| **NFR-013** | Portability | The product is self-hostable on the same code as hosted. | `hobo yard up` bootstraps a working Yard ([04](../design/04-control-plane.md)) | BR-007 |
| **NFR-014** | Observability | OTel logs/traces/metrics for control + data planes. | Traces present for a deploy + a run ([14](../design/14-observability.md)) | BR-006 |
| **NFR-015** | Usability/Docs | Machine-readable docs (`llms.txt`) + instant `npx` onboarding so agents and humans self-serve. | Onboarding test; docs present | BR-001/BR-004 |
| **NFR-016** | Accessibility/i18n | CLI/runtime error output is screen-reader-friendly and an **i18n framework is integrated from P3**; the dashboard meets **WCAG 2.1 AA** and ships a pseudo-localization-passing i18n layer at P6. | automated WCAG audit + manual review (P6 dashboard); pseudo-loc test (200% string length, RTL) passes | BR-001 |
| **NFR-017** | Ease-of-use | Failure output is **actionable**: every blocked gate / failed deploy states root cause + 1–2 remediation steps, machine-readable for agent self-correction. | `explain-failure` on a seeded failure yields cause + fix steps; agent self-corrects in the MCP E2E | BR-001/BR-004 |
| **NFR-018** | Security/Audit | Compliance audit streams (`token.*`/`resource.*`/policy decisions) are retained for a defined minimum and **never compacted**. | retention test: stream older than the floor still present ([ADR-0023](../design/adr/ADR-0023-security-posture-commitments.md)) | BR-006/BR-010 |
| **NFR-019** | Security/Availability | The Gateway and MCP surface enforce **per-principal and per-tenant rate limits + quotas** with backpressure. | a flooding agent is throttled (typed error); legitimate volume unaffected ([ADR-0023](../design/adr/ADR-0023-security-posture-commitments.md)) | BR-007/BR-011 |
| **NFR-020** | Portability | The **agnostic core never imports a provider/adapter package**; enforced at build time. | CI dependency-graph lint fails on a core→provider import ([ADR-0024](../design/adr/ADR-0024-portability-conformance-guarantee.md)) | BR-002 |
| **NFR-021** | Observability/AI | Trainable-method execution is captured as **OTel/OpenInference trajectories** and scored by **live-evals** (the training signal + performance telemetry), with no backend-lock-in telemetry path. | OpenInference spans present per call; live-eval reward attached; exports to the tenant's OTLP backend ([14](../design/14-observability.md), [ADR-0025](../design/adr/ADR-0025-use-training-directive-and-training-engine.md)) | BR-006/BR-008 |

## 8. UX / UI requirements ([07-ui-dashboard.md](../design/07-ui-dashboard.md))
Core views (P6 depth): **Deployments timeline** (event-sourced, replay/time-travel scrubber, rollback on DAG); **Topology graph** (resources→providers, bind edges w/ connectivity + cost); **Run inspector** (step/actor/saga trace, per-step I/O, replay-diff vs current code); **Registry browser** (capabilities, signs, Forge provenance); **Agent activity & credential audit** (token grant/use/revoke, approvals); **Cost & FinOps** (plan vs actuals, budgets, showback); **Drift** (heal/propose). Key interactions: plan preview, approve policy gates, promote/rollback, live tail.

## 9. Release criteria (definition of done per phase)
From [08-roadmap.md](../design/08-roadmap.md) exit criteria; MVP line at **P4** ([ADR-0022](../design/adr/ADR-0022-mvp-scope-moscow.md)):
- **P0/P1:** `world-local` passes World-port conformance; hello-bindle runs offline; replay == live.
- **P2:** reference Bindle deploys to a real cloud and survives a Yard restart mid-deploy.
- **P3:** an agent deploys via MCP using only brokered tokens; credential audit present.
- **P4 (v1 GA):** one Bindle deploys to ≥2 clouds; cross-cloud mTLS works.
- **P5:** `hobo forge <url>` produces a certified provider passing conformance. **Governance phase 1:** policy gates + approval obligations + `can-deploy` (FR-050/051/052) are usable.
- **P6:** canary auto-rollback; plan-time cost within tolerance; DR rebuild < RTO; dashboard + accessibility (NFR-016). **Governance phase 2:** resource-driven Resource Definitions/Matching + Packs (FR-060/061/062) at depth.

## 10. Analytics / success metrics
Instrument the [BRD KPIs](./BRD.md#10-success-metrics--kpis): time-to-first-deploy, providers-per-Bindle, zero-secret rate, agent-completable lifecycle %, Forge yield, recovery times. Derived from the event log (no separate telemetry path required for control-plane KPIs).

## 11. Dependencies, assumptions, constraints
- **Dependencies:** WASI/WIT, Pulumi Automation API, SPIFFE/OIDC, MCP ([BRD §14](./BRD.md#14-dependencies)).
- **Assumptions:** providers publish or accept Forge-generated Hobo Code; agents are a real delivery channel.
- **Constraints:** agnostic core may not leak provider detail; conformance gates everything; phase-gated delivery.

## 12. Risks & open questions
Inherits the [BRD risk register](./BRD.md#15-risk-register). Open product questions (from [09](../design/09-verification-open-questions.md)): compiler-magic depth for `"use workflow"`; default Planner objective; "low-risk auto live-fix" threshold; first P2 provider; IfC fidelity for non-TS languages. Tracked as ADR-P items in [18-adr-log](../design/18-adr-log.md).

## 13. Out of scope (v1)
Per [§3](#3-goals--non-goals) and [00 non-goals](../design/00-vision.md): non-developer PaaS UI; replacing IaC engines; all clouds at once; app framework; standalone secrets product.

## 14. References
[02 SDK](../design/02-sdk-api.md) · [06 AI/agent](../design/06-ai-native-agent-auth.md) · [07 UI](../design/07-ui-dashboard.md) · [15 CLI/DX](../design/15-cli-dx.md) · [19 Worked example](../design/19-worked-example.md) · [BRD](./BRD.md) · [TRD](./TRD.md) · ADRs [0019](../design/adr/ADR-0019-persona-prioritization-icp.md)/[0021](../design/adr/ADR-0021-nfr-baselines-slos.md)/[0022](../design/adr/ADR-0022-mvp-scope-moscow.md).
