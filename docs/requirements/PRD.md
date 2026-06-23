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
| Related | [BRD](./BRD.md), [TRD](./TRD.md), [02 SDK](../design/sdk-api.md#plan-02), [06 AI/agent](../design/ai-native-agent-auth.md#plan-06), [07 UI](../design/developer-experience.md#plan-07), [15 CLI/DX](../design/developer-experience.md#plan-15), [19 Worked example](../design/worked-example.md#plan-19) |

### 1.1 RACI (product decisions)
| Activity | Product | Founders | Eng | UX | Security |
|---|---|---|---|---|---|
| Persona/journey definition | **A/R** | C | C | C | I |
| Functional scope & priority | **A/R** | C | C | C | C |
| NFR baselines ([ADR-0021](../design/adr/08-scope-and-requirements.md#adr-0021)) | A | C | **R** | C | C |
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
*"Write your app once in TypeScript. HoBo decides how to host it — and gets out of the way when you want control. Built for humans and the agents that work for them."* ([vision.md#plan-00](../design/vision.md#plan-00)). The product realizes six principles: agnostic by default / optimizable on demand; everything replayable; agents are users; ports over platforms; self-host = hosted; conformance is the contract.

## 3. Goals & non-goals
**Goals:** minutes-to-first-deploy; one Bindle to many clouds, unedited; safe autonomous agent operation; openness/self-host; AI-generated providers without a community bottleneck.
**Non-goals (positioning, not deferrals)** ([vision.md#plan-00](../design/vision.md#plan-00)): HoBo **composes** Terraform/Pulumi/OpenTofu rather than replacing them; it is not a generic app framework or a standalone secrets product. Broad cloud coverage comes **on demand via the Forge** rather than pre-enumerating every cloud. *(The full dashboard / UI generation and the hosted multi-tenant operator are now in v1, not out of scope — [ADR-0063](../design/adr/08-scope-and-requirements.md#adr-0063).)*

## 4. Personas & roles
Priority per [ADR-0019](../design/adr/08-scope-and-requirements.md#adr-0019).

| Persona | Goals | Pain today | Success looks like |
|---|---|---|---|
| **Dana — indie/startup developer** (primary) | Ship a TS app fast; not learn N cloud APIs; avoid lock-in | IaC sprawl, cloud-specific rewrites | `hobo deploy` lands on a real cloud in minutes; swapping clouds is a config edit |
| **Atlas — AI agent** (co-primary) | Deploy/operate apps on a user's behalf, safely | Treated as a bolt-on API client; static keys; no audit | Obtains scoped tokens, deploys via MCP, self-corrects from logs; every action audited |
| **Priya — platform engineer** (secondary) | Standardize how resources are realized; enforce policy/cost | Bespoke golden paths, drift | Authors Resource Definitions + policy packs; dev teams self-serve within guardrails |
| **Omar — operator/SRE** | Keep the Yard healthy; recover fast | Opaque deploys, manual DR | Event-sourced timeline, drift heal, replay-based DR |
| **The Crew — built-in Operator Agents** (SRE/Endpoint Monitor/GitOps/Platform Engineer) | Run the platform autonomously within guardrails | Ops is manual or a DIY agent kit; no audit | Built-in, audited, policy-gated Yard services that diagnose/promote/generate; humans approve high-risk writes ([40](../design/operators-sre.md#plan-40)) |

## 5. Primary user journeys
**J1 — Human developer (happy path)** ([developer-experience.md#plan-15](../design/developer-experience.md#plan-15)):
```bash
npx hobo new my-app -t fullstack && cd my-app && hobo dev   # runs locally, no cloud
# edit app code
hobo login && hobo plan --camp prod                         # dry-run: plan + cost + warnings
hobo deploy --camp prod --strategy canary                   # provision + shift traffic
```
**J2 — Agent via MCP** ([ai-native-agent-auth.md#plan-06](../design/ai-native-agent-auth.md#plan-06)): `list_templates → new → plan → deploy (brokered tokens) → inspect_run/tail_logs → self-correct`.
**J3 — Optimize a boundary** ([worked-example.md#plan-19](../design/worked-example.md#plan-19)): split one resource onto a different provider by editing `hobo.config.ts` only — no app-code change.
**J4 — Platform engineer governs** ([25](../design/platform-engineering.md#plan-25)/[30](../design/contracts-policy-flags.md#plan-30)): author a Resource Definition + policy pack; matching selects it per environment; high-risk actions require approval.
**J5 — Missing provider** ([06](../design/ai-native-agent-auth.md#plan-06)): `hobo forge <url>` generates + sandbox-certifies a provider, then it's usable like any other.

## 6. Functional requirements (`FR-NNN`)
> All FRs are **v1** ([ADR-0063](../design/adr/08-scope-and-requirements.md#adr-0063)). The M/S/C label is **build priority within v1** (which to nail first), not a release gate — there is no "Won't" tier. Each has acceptance criteria (AC) and a back-trace to `BR`.

### 6.1 Authoring & SDK ([02](../design/sdk-api.md#plan-02), [21](../design/authoring-resources-wiring.md#plan-21), [22](../design/authoring-resources-wiring.md#plan-22))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-001** | Declare app topology in a provider-agnostic `bindle.ts` (resources + bindings). | M | A `bindle()` with ≥2 resources + a `bind` compiles and runs on the local Camp (`runtime-local`). | BR-001 |
| **FR-002** | Resource catalog with inline `.allow()` permissions (IfC), collected at build. | M | `hobo collect` emits a manifest matching a fixture; `.allow()` yields the expected IAM + link + token-scope triple ([09](../design/verification.md#plan-09)). | BR-001/BR-005 |
| **FR-003** | Runtime primitives: `step`, `workflow`, `actor`, `saga`, `agent`, `sleep`/`cron`, hooks, streams. | M | hello-bindle runs a workflow + actor + saga; replay == live state. | BR-001/BR-006 |
| **FR-004** | Separate `hobo.config.ts` (where/how) from `bindle.ts` (what). | M | Swapping the mapped provider edits only config ([ADR-0011](../design/adr/README.md)). | BR-002 |
| **FR-005** | Typed provider-specific options via `.with(...)`, inert for non-resolved providers; `require`/`prefer`. | M | The same Bindle resolves to ≥2 providers; `.with()` affects only the resolved one ([09](../design/verification.md#plan-09)). | BR-002/BR-003 |
| **FR-006** | Mapping styles: whole-app default, per-tier, per-boundary. | M | Each style deploys the reference app. | BR-002 |
| **FR-015** | Config & secrets load via `ctx.config` (`config()`/`secretRef()`/`env()`), resolved to **references per Camp**, **secretless-first** (bound resource via brokered token → provider secret store at use-time → bounded static fallback). | M | A secret resolves via a brokered token with **no value at rest**; `config.Resolved`/`secret.Accessed` events present; value redacted **at capture** from logs/spans/trajectories ([Plan 31](../design/authoring-resources-wiring.md#plan-31), [ADR-0027](../design/adr/02-identity-security.md#adr-0027)). | BR-005 |

### 6.2 CLI & DX ([15](../design/developer-experience.md#plan-15))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-010** | Core CLI: `new`, `dev`, `build`, `collect`, `plan`, `deploy`, `promote`, `rollback`, `destroy`, `inspect`, `logs`, `drift`, `login`, `registry`, `doctor`. | M | Each command runs on the reference app; `plan` shows plan + cost + warnings. | BR-001 |
| **FR-011** | `hobo dev` runs the full app locally on the local Camp (`runtime-local`) with **zero cloud**. | M | Cold `hobo dev` ≤60 s, no credentials required (NFR-002). | BR-001 |
| **FR-012** | Deployment strategies (`recreate`/`blue-green`/`canary`/`progressive`) selectable per service. | S | Canary regression auto-rolls-back ([05](../design/reliability-observability-cost.md#plan-05)). | BR-006 |
| **FR-013** | Verification CLI: `verify`, `can-deploy`, `explain-failure`, `fix --dry-run`. | S | A producer/consumer skew is blocked with a precise reason ([29](../design/contracts-policy-flags.md#plan-29)); `explain-failure` output meets the error-UX bar in NFR-017. | BR-010 |
| **FR-014** | `hobo doctor` runs a **portability + security lint**: warns (non-blocking, explained) on provider lock-in (provider-specific `.with()` for only one provider) and on static-key use where federation is available. | S | doctor flags a single-provider `.with()` resource and a static-key binding with an actionable message ([ADR-0024](../design/adr/07-portability-extensibility.md#adr-0024)/[ADR-0023](../design/adr/02-identity-security.md#adr-0023)). | BR-002/BR-003/BR-005 |

### 6.3 AI-native & agent operation ([06](../design/ai-native-agent-auth.md#plan-06))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-020** | Every CLI/SDK capability has an **MCP** equivalent with the same identity model. | M | An agent drives `plan→deploy→inspect_run` via `@hobo/mcp` ([09](../design/verification.md#plan-09)). | BR-004 |
| **FR-021** | Durable `agent()` with tools-as-steps; `ctx.identity` (SVID) + `ctx.token(...)` brokered tokens injected. | M | An agent run is replayable; `token.*` events present. | BR-004/BR-006 |
| **FR-022** | Agent guardrails: `require-approval`/`auto-allow`/`deny`, `spendCapUsd`, destroy protection. | M | A high-risk action blocks on a policy gate; spend over cap requires approval. | BR-011 |
| **FR-023** | Keyless credentials: agents obtain short-lived, resource-scoped provider tokens via OIDC federation (no static keys). | M | A deploy completes with zero static secrets; full grant/use/revoke audit. | BR-005 |

### 6.4 Providers, Registry & Capability Manifest ([03](../design/control-plane.md#plan-03), [06](../design/ai-native-agent-auth.md#plan-06))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-030** | ≥2 cloud providers (e.g. AWS + Azure) implement the capability ports via IaC adapters. | M | The reference app deploys to both; conformance green. | BR-002 |
| **FR-031** | Providers publish machine-readable **Capability Manifest** (`capabilities/auth/cost.json`) at a well-known path; the **Registry** indexes it. | M | An agent discovers a capability + auth flow from the Registry. | BR-004/BR-008 |
| **FR-032** | Capability/region/cost-aware **Planner** turns Bindle + mapping into a DeploymentPlan; records rationale. | M | Planner rejects an unsatisfiable `require` with a precise reason; rationale on `deployment.Planned`. | BR-002/BR-009 |

### 6.5 Forge, stubbable & trainable implementations ([06](../design/ai-native-agent-auth.md#plan-06), [23](../design/forge-generated-stack.md#plan-23))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-040** | `stub()` behind any WIT port records calls and returns typed responses so an app runs before impls exist. | S | The reference app runs end-to-end with a stubbed port; calls recorded as events. | BR-008 |
| **FR-041** | **Forge** generates a candidate provider from docs/OpenAPI/Terraform, sandbox-tests against conformance, signs + publishes on pass. | S | `hobo forge <url>` yields a certified provider passing conformance ([09](../design/verification.md#plan-09)). | BR-008 |
| **FR-042** | AI implement/evolve/**live-fix**, gated: low-risk auto-canary w/ auto-rollback; prod/high-risk requires approval. | S→C | A simulated SLO regression drives a gated live-fix that auto-rolls-back on failure. | BR-008/BR-011 |
| **FR-043** | **`"use training"`** directive (peer to `"use workflow"`/`"use step"`) marks a method an AI-rewritable semantic function; it carries **intent + contract + rubric** (semantic grounding) and HoBo continuously optimizes it via an **internal `training-engine`** (built-in default; Microsoft Agent Lightning/Trace optional, **not SDK-exposed**). | S | A `"use training"` method missing intent/rubric is linted; a trained candidate promotes only through conformance + eval + policy ([23](../design/forge-generated-stack.md#plan-23), [ADR-0025](../design/adr/06-ai-generation-operators.md#adr-0025)). | BR-008 |

### 6.6 Governance: contracts, policy, evals, Gatekeeper ([29](../design/contracts-policy-flags.md#plan-29), [30](../design/contracts-policy-flags.md#plan-30))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-050** | `can-deploy` compatibility gate checks a change against versions running per environment. | S | A producer/consumer skew emits `compat.GateFailed`. | BR-010 |
| **FR-051** | Unified policy decisions (`allow/deny/warn/mutate/require-approval`) with **obligations** as durable effects. | S | A "allow but require canary" obligation is tracked `ObligationCreated→Satisfied`. | BR-010/BR-011 |
| **FR-052** | A single **Gatekeeper** (`hobo verify`) composes contracts + policy + evals + conformance + cost. | S | One explainable, event-sourced decision blocks/permits promote. | BR-006/BR-010 |

### 6.7 Platform-engineering surface ([25](../design/platform-engineering.md#plan-25)–[27](../design/platform-engineering.md#plan-27))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-060** | Resource Definitions + Matching select *how* a port is realized per context; decision recorded as `match.Decided`. | C | A matching test asserts the expected definition wins with its score ([09](../design/verification.md#plan-09)). | BR-010 |
| **FR-061** | Environments via Deployment Sets + Deltas (draft→promote); incremental reconcile of changed nodes. | C | A delta applied yields the expected immutable Set. | BR-010 |
| **FR-062** | Resource Packs (shareable bundles of definitions) installable from the marketplace. | C | A pack installs and its definitions participate in matching. | BR-012 |

### 6.8 Observability & cost ([07](../design/developer-experience.md#plan-07), [14](../design/reliability-observability-cost.md#plan-14), [16](../design/reliability-observability-cost.md#plan-16))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-070** | `hobo plan` returns a projected cost before provisioning; budgets/caps as policy gates; showback per tenant/Bindle/Camp. | S→C | Plan estimate within ±20% of a fixture; a budget breach blocks or requires approval. | BR-009 |
| **FR-071** | Dashboard: deployments timeline (replay/time-travel), topology graph (+ connectivity/cost), run inspector (replay-diff), credential audit, drift. | C | Each view renders for the reference app from projections only. | BR-006/BR-009 |

### 6.9 Operator Agents, the generated infrastructure stack & patchability ([40](../design/operators-sre.md#plan-40)–[43](../design/forge-generated-stack.md#plan-43))
| ID | Requirement | Pri | AC | BR |
|---|---|---|---|---|
| **FR-080** | A built-in roster of **Operator Agents** (SRE / Endpoint Monitor / GitOps / Platform Engineer) runs as Yard services — each a principal (SVID + per-agent policy), event-sourced, MCP-surfaced; reads autonomous, writes policy-gated; reasoning engine behind a port. *(No UX-Designer operator — out of scope, [ADR-0064](../design/adr/08-scope-and-requirements.md#adr-0064).)* | S→C | A simulated SLO breach dispatches SRE; a prod fix requires approval, a low-risk fix auto-canaries + auto-rolls-back; every action audited ([40](../design/operators-sre.md#plan-40)). | BR-004 |
| **FR-081** | HoBo generates / self-heals / persists **infrastructure** across the **generated stack** (data·business·message·intelligence) via one loop + one trust boundary + one persistence mechanism. | C | A WIT-record change propagates per-layer as gated, reviewable diffs; `hobo codegen --check` flags hand-edited drift ([41](../design/forge-generated-stack.md#plan-41)). | BR-004/BR-008 |
| ~~**FR-082**~~ | **App-UI generation — REMOVED (out of scope, [ADR-0064](../design/adr/08-scope-and-requirements.md#adr-0064)).** Generating the developer's own product front-end is app-build-out, not meta-cloud infrastructure; the `ui-render` port and `Design.md` are dropped (the former Plan 42, [ADR-0064](../design/adr/08-scope-and-requirements.md#adr-0064)). | — | — | — |
| **FR-083** | **Patchability**: any engine/adapter is swappable behind its port, the Yard is forkable, and AI/human patches persist (region-scoped AST + provenance) — all conformance-gated. | C | A custom engine shipped as a signed plugin passes conformance + is Matching-selected with no core edit; a persisted patch survives regeneration ([43](../design/forge-generated-stack.md#plan-43)). | BR-002 |
| **FR-084** | **Continuous/live security scanning + remediation**: vuln/SBOM/drift scans re-run on running Sets; findings ride the policy plane; remediation is the gated live-fix loop; findings export as OCSF. | S→C | A newly-disclosed CVE in a running Set raises a policy decision; a low-risk dep-bump auto-remediates, a prod one requires approval ([12](../design/security-networking.md#plan-12)/[40](../design/operators-sre.md#plan-40)). | BR-005/BR-008 |

## 7. Non-functional requirements (`NFR-NNN`)
> The three review lenses — **security, ease-of-use, portability** — are first-class and tagged. Baselines from [ADR-0021](../design/adr/08-scope-and-requirements.md#adr-0021).

| ID | Category | Requirement | Target / method | BR |
|---|---|---|---|---|
| **NFR-001** | Portability | One **unedited** Bindle deploys to multiple providers; provider details never leak into the agnostic core. "Unedited" = `bindle.ts` + app `src/` byte-identical across targets; only `hobo.config.ts`/env vary. | ≥2 providers at v1; `multi-cloud-shop` E2E asserts identical topology ([ADR-0024](../design/adr/07-portability-extensibility.md#adr-0024), [03](../design/control-plane.md#plan-03)) | BR-002 |
| **NFR-002** | Ease-of-use | Local dev with zero cloud/credentials. | `hobo dev` ≤60 s cold | BR-001 |
| **NFR-003** | Ease-of-use | Time-to-first-deploy on the happy path. | ≤10 min p50 (E2E timing) | BR-001 |
| **NFR-004** | Ease-of-use | Parity across surfaces: anything in the CLI/SDK is also in MCP. | Surface-parity test ([09](../design/verification.md#plan-09)) | BR-004 |
| **NFR-005** | Security | Zero static secrets by default; provider access via short-lived scoped tokens. The legacy static-key escape hatch is **bounded** (max TTL, enforced rotation, fully audited, opt-in). | ≥99% brokered; audit of `token.*`; a key past TTL is rejected ([ADR-0023](../design/adr/02-identity-security.md#adr-0023)) | BR-005 |
| **NFR-006** | Security | Tenant isolation across data/compute/credentials/network/wasm-capability. | Cross-tenant read fails at Gateway + store ([12](../design/security-networking.md#plan-12)) | BR-006 |
| **NFR-007** | Security | AI-generated code is sandboxed (Firecracker + wasm capability, no egress in conformance) and only runs if signed + conformance-passing. | Executor egress test; unsigned plugin refused ([12](../design/security-networking.md#plan-12)) | BR-008 |
| **NFR-008** | Auditability | Every state transition is an append-only event; replayable/time-travelable. | Projection rebuild == live ([11](../design/event-model.md#plan-11)) | BR-006 |
| **NFR-009** | Reliability | Control-plane availability; crash-resume; saga compensation. | 99.9%/99.95%; resume <30 s ([05](../design/reliability-observability-cost.md#plan-05)) | BR-007 |
| **NFR-010** | Recoverability | DR is replay from the log. | RPO ~0/≤5 s; RTO <15 min ([05](../design/reliability-observability-cost.md#plan-05)) | BR-007 |
| **NFR-011** | Determinism | Durable runs replay to identical state. | `replay == live` (hard invariant) | BR-006 |
| **NFR-012** | Cost | Plan-time cost accuracy. | within ±20% of fixture ([16](../design/reliability-observability-cost.md#plan-16)) | BR-009 |
| **NFR-013** | Portability | The product is self-hostable on the same code as hosted. | `hobo yard up` bootstraps a working Yard ([04](../design/control-plane.md#plan-04)) | BR-007 |
| **NFR-014** | Observability | OTel logs/traces/metrics for control + data planes. | Traces present for a deploy + a run ([14](../design/reliability-observability-cost.md#plan-14)) | BR-006 |
| **NFR-015** | Usability/Docs | Machine-readable docs (`llms.txt`) + instant `npx` onboarding so agents and humans self-serve. | Onboarding test; docs present | BR-001/BR-004 |
| **NFR-016** | Accessibility/i18n | CLI/runtime error output is screen-reader-friendly and an **i18n framework is integrated from build stage 3**; the dashboard meets **WCAG 2.1 AA** and ships a pseudo-localization-passing i18n layer at build stage 6. | automated WCAG audit + manual review (stage-6 dashboard); pseudo-loc test (200% string length, RTL) passes | BR-001 |
| **NFR-017** | Ease-of-use | Failure output is **actionable**: every blocked gate / failed deploy states root cause + 1–2 remediation steps, machine-readable for agent self-correction. | `explain-failure` on a seeded failure yields cause + fix steps; agent self-corrects in the MCP E2E | BR-001/BR-004 |
| **NFR-018** | Security/Audit | Compliance audit streams (`token.*`/`resource.*`/policy decisions) are retained for a defined minimum and **never compacted**. | retention test: stream older than the floor still present ([ADR-0023](../design/adr/02-identity-security.md#adr-0023)) | BR-006/BR-010 |
| **NFR-019** | Security/Availability | The Gateway and MCP surface enforce **per-principal and per-tenant rate limits + quotas** with backpressure. | a flooding agent is throttled (typed error); legitimate volume unaffected ([ADR-0023](../design/adr/02-identity-security.md#adr-0023)) | BR-007/BR-011 |
| **NFR-020** | Portability | The **agnostic core never imports a provider/adapter package**; enforced at build time. | CI dependency-graph lint fails on a core→provider import ([ADR-0024](../design/adr/07-portability-extensibility.md#adr-0024)) | BR-002 |
| **NFR-021** | Observability/AI | Trainable-method execution is captured as **OTel/OpenInference trajectories** and scored by **live-evals** (the training signal + performance telemetry), with no backend-lock-in telemetry path. | OpenInference spans present per call; live-eval reward attached; exports to the tenant's OTLP backend ([14](../design/reliability-observability-cost.md#plan-14), [ADR-0025](../design/adr/06-ai-generation-operators.md#adr-0025)) | BR-006/BR-008 |

## 8. UX / UI requirements ([developer-experience.md#plan-07](../design/developer-experience.md#plan-07))
Core views (built at stage 6): **Deployments timeline** (event-sourced, replay/time-travel scrubber, rollback on DAG); **Topology graph** (resources→providers, bind edges w/ connectivity + cost); **Run inspector** (step/actor/saga trace, per-step I/O, replay-diff vs current code); **Registry browser** (capabilities, signs, Forge provenance); **Agent activity & credential audit** (token grant/use/revoke, approvals); **Cost & FinOps** (plan vs actuals, budgets, showback); **Drift** (heal/propose). Key interactions: plan preview, approve policy gates, promote/rollback, live tail.

## 9. Release criteria (single v1 definition of done)
v1 ships the whole designed surface ([ADR-0063](../design/adr/08-scope-and-requirements.md#adr-0063)); **v1 GA = every build-stage acceptance gate below is green** ([08 v1 delivery plan](../design/roadmap.md#plan-08), [per-stage build detail](../design/roadmap.md#per-stage-build-detail-stages-06)). The stages are a build sequence, not separate releases.
- **Stage 0/1:** the local Camp (`runtime-local`) passes runtime-port conformance; hello-bindle runs offline; replay == live.
- **Stage 2:** reference Bindle deploys to a real cloud and survives a Yard restart mid-deploy; the Gatekeeper blocks an unsafe change with an explainable reason (policy gates + approval obligations + `can-deploy`, FR-050/051/052).
- **Stage 3:** an agent deploys via MCP using only brokered tokens; credential audit present.
- **Stage 4:** one Bindle deploys to ≥2 clouds; cross-cloud mTLS works; switching a resource's provider touches only config; resource-driven Resource Definitions/Matching + Packs (FR-060/061/062) participate in resolution.
- **Stage 5:** `hobo forge <url>` produces a certified provider passing conformance; a stubbed port gets an AI-generated, conformance-passing implementation promoted through the eval gate.
- **Stage 6:** canary auto-rollback; plan-time cost within tolerance; DR rebuild < RTO; full dashboard + accessibility (NFR-016); and the governance planes usable — a `notify` send is event-sourced + consent-gated, a classified field drives an enforced residency/retention obligation with crypto-shred erasure, a guardrail blocks a flagged model output, and a certified Registry listing installs via Matching (uncertified stays unlisted).

## 10. Analytics / success metrics
Instrument the [BRD KPIs](./BRD.md#10-success-metrics--kpis): time-to-first-deploy, providers-per-Bindle, zero-secret rate, agent-completable lifecycle %, Forge yield, recovery times. Derived from the event log (no separate telemetry path required for control-plane KPIs).

## 11. Dependencies, assumptions, constraints
- **Dependencies:** WASI/WIT, Pulumi Automation API, SPIFFE/OIDC, MCP ([BRD §14](./BRD.md#14-dependencies)).
- **Assumptions:** providers publish or accept Forge-generated Capability Manifest; agents are a real delivery channel.
- **Constraints:** agnostic core may not leak provider detail; conformance gates everything; single-v1 delivery in dependency-ordered build stages ([ADR-0063](../design/adr/08-scope-and-requirements.md#adr-0063)).

## 12. Risks & open questions
Inherits the [BRD risk register](./BRD.md#15-risk-register). Open product questions (from [09](../design/verification.md#plan-09)): compiler-magic depth for `"use workflow"`; default Planner objective; "low-risk auto live-fix" threshold; first-deploy provider (build stage 2); IfC fidelity for non-TS languages. Tracked as ADR-P items in [18-adr-log](../design/adr/README.md).

## 13. Out of scope (positioning anti-goals, not deferrals)
Per [§3](#3-goals--non-goals) and [00 non-goals](../design/vision.md#plan-00): HoBo composes IaC engines rather than replacing them; it is not a generic app framework or a standalone secrets product; broad cloud coverage is Forge-on-demand, not pre-enumerated. There is no "later release" bucket — everything designed is in v1 ([ADR-0063](../design/adr/08-scope-and-requirements.md#adr-0063)).

## 14. References
[02 SDK](../design/sdk-api.md#plan-02) · [06 AI/agent](../design/ai-native-agent-auth.md#plan-06) · [07 UI](../design/developer-experience.md#plan-07) · [15 CLI/DX](../design/developer-experience.md#plan-15) · [19 Worked example](../design/worked-example.md#plan-19) · [BRD](./BRD.md) · [TRD](./TRD.md) · ADRs [0019](../design/adr/08-scope-and-requirements.md#adr-0019)/[0021](../design/adr/08-scope-and-requirements.md#adr-0021)/[0063](../design/adr/08-scope-and-requirements.md#adr-0063).
