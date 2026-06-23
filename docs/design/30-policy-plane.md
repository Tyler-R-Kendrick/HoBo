# Plan 30 — The policy plane (decisions, obligations & gates)

> Part of the [HoBo Design Plan Suite](./README.md). Consolidates HoBo's scattered gates ([Plan 5](./05-reliability-ha.md)/[Plan 6](./06-ai-native-agent-auth.md)/[Plan 12](./12-security-multitenancy.md)/[Plan 28](./28-relay-gitops-pipelines.md)) into **one decision model** — a HoBo-native policy plane with engines behind a WIT port. No new dependency.

## Why a plane (not scattered gates)
HoBo already gates agent actions, live-fix, deploys, and pipelines — but each is bespoke and mostly boolean. The contribution here is a **single policy decision model** that every gate calls, with **lifecycle phases**, **rich effects**, and **obligations**. It answers one question everywhere:

> *Is this action allowed, denied, warned, mutated, gated for approval — and what must follow if allowed?*

In the four-lens taxonomy ([Plan 29](./29-contracts-compatibility.md)): **Policy = may/may not be allowed** (distinct from *Contract = must never break* and *Eval = should improve*).

## The decision model
A decision **request** describes the action in context:
```text
request = {
  subject:  { kind: user|service|agent|system, id, roles?, scopes?, delegatedBy? }
  action:   deployment.apply | resource.delete | agent.tool.call | contract.promote
            | semantic.implementation.promote | provider.plugin.certify | runtime.invoke | …
  resource: { kind: app|environment|deployment|contract|semantic-function|agent|secret|…, id }
  phase:    author | local | test | plan | apply | runtime | observe | train | promote | repair
  context:  { graphDiff?, deploymentPlan?, contractResults?, evalResults?, costEstimate?,
              dataClassifications?, region?, provider?, riskScore?, traceSummary? }
}
```
> **End-user authorization rides this model.** `subject.kind = user` is populated from a verified **`ctx.user`** ([Plan 36](./36-end-user-auth.md)/[ADR-0038](./adr/02-identity-security.md#adr-0038)) — its claims (`roles`/`scopes`/tenant) drive record-level rules like "a user may read only their own orders" as a **`policy.Decided`**, the same way agent/service actions are gated. No separate end-user authz engine; `.allow()` ([Plan 21](./21-resources-catalog.md)) is the declarative shorthand over these user-claim rules.

The **decision** is richer than allow/deny:
```text
decision = {
  effect: allow | allow-degraded | deny | warn | mutate | require-approval
  reason, violations[], mutations[], approvals[]
  obligations[]            // "allowed, but you must…"
  evidence: { policyIds[], inputHash, engine }   // → recorded as an event
}
```

## Obligations are HoBo effects (the powerful part)
An **obligation** lets policy say *allow but require X*, and in HoBo that X is a **durable, event-sourced effect/saga** ([Plan 5](./05-reliability-ha.md)) — not advice the caller may ignore. Examples:
- *allow deploy* **→ require canary** (the Orchestrator must roll out as canary, [Plan 26](./26-environments-deltas.md)).
- *allow public endpoint* **→ require auth middleware** (a graph mutation before apply).
- *allow model change* **→ require shadow evaluation** ([Plan 23](./23-stubbable-ai-implementations.md)).
- *allow generated provider* **→ require sandbox verification** ([Plan 23](./23-stubbable-ai-implementations.md)).
- *allow agent action* **→ require human approval before apply** (a `createHook`, [Plan 6](./06-ai-native-agent-auth.md)).
- *allow spend-incurring action within quota* **→ deny past a hard quota, or trip a spend circuit-breaker on runaway velocity** ([Plan 16](./16-cost-finops.md)/[ADR-0039](./adr/04-governance-verification.md#adr-0039)) — the `MeteringView` counter is the policy input, the breaker is a durable obligation/saga ([Plan 5](./05-reliability-ha.md)) halting deploys/agent-provisioning/Forge-runs until acknowledged.
- *allow at this spend velocity* **→ `allow-degraded` + a degradation obligation** (*"enter the reduced tier; shed batch/analytics"*) when **spend velocity** would cross a `costAvailabilityProfile` tier before period end ([Plan 16](./16-cost-finops.md)/[ADR-0066](./adr/04-governance-verification.md#adr-0066)) — graceful QoS shedding by priority is the durable effect, the runaway-spend breaker the last resort.
- *allow a feature-flag flip* **→ require approval for a prod kill-switch / risky `%` bump, or attach an auto-revert obligation on SLO burn** ([Plan 37](./37-feature-flags-progressive-delivery.md)/[ADR-0044](./adr/04-governance-verification.md#adr-0044)) — a `flag.Changed` is a policy-gated event like any other deploy-affecting action.
- *allow a `notify` send* **→ deny to an opted-out recipient, or defer until the quiet-hours window opens** ([Plan 21](./21-resources-catalog.md)/[ADR-0059](./adr/03-data-plane.md#adr-0059)) — consent + per-recipient rate limits are obligation-checked preconditions, with deferral a durable effect (not advice).
- *allow a deploy/runtime action on classified data* **→ deny if it places/moves the data outside its allowed region, or past its retention ceiling** ([Plan 46](./46-compliance-governance.md)/[ADR-0060](./adr/04-governance-verification.md#adr-0060)) — `context.dataClassifications`/`region` (above) drive a residency/retention obligation at `can-deploy` *and* runtime; routing to an unregistered subprocessor is denied.
- *allow an AI output* **→ block, redact, or require-approval on a guardrail failure** ([Plan 47](./47-ai-safety-model-governance.md)/[ADR-0061](./adr/04-governance-verification.md#adr-0061)) — moderation/PII/jailbreak/grounding checks are a policy-gated step (`guardrail.Blocked`); guardrail-coverage is a *promote*-phase contract for model/prompt changes.
Obligations are tracked to completion via `policy.ObligationCreated` → `…Satisfied` events; an unsatisfied obligation blocks the gate. **Obligations may carry a deadline:** an unmet obligation past its deadline **escalates** (e.g. an unacked incident pages up the on-call ladder) rather than silently lingering ([Plan 44](./44-sre-incident-management.md)) — the durable form of an SLA on a follow-up.

## Phases (policy spans the whole lifecycle)
| Phase | Example rule |
|---|---|
| author | public handlers must declare input schemas |
| local | no hardcoded secrets in source |
| test | every external interaction needs a contract ([Plan 29](./29-contracts-compatibility.md)) |
| plan | prod data resources must be encrypted + backed up |
| apply | no prod resource deletion without approval |
| runtime | an agent cannot call a tool outside its delegated scope |
| observe | PII must not appear in traces |
| train | PII-bearing traces can't be used for training |
| promote | a candidate impl must beat the champion on evals ([Plan 23](./23-stubbable-ai-implementations.md)) |
| repair | agents may auto-fix preview, only *propose* prod changes |

## Policy packs
Rules are grouped into **policy packs** — versioned, **signed** resources ([Plan 12](./12-security-multitenancy.md)) scoped to org/app/environment and bound per target ([Plan 25](./25-resource-definitions-matching.md) matching can select which pack applies). Packs are distributed like Resource Packs ([Plan 27](./27-drivers-packs-profiles.md)) and Forge-generatable. Because packs are signed + portable, they **federate across sovereign Yards in a `Junction`** ([ADR-0043](./adr/07-portability-extensibility.md#adr-0043)) — shared policy without a shared control plane.

## Engine behind a port (no dependency)
`policy-engine` is a **WIT port**. The **default** implementation is built-in **TypeScript rules** (typed, testable, no Rego to learn). Optional capability providers: **OPA/Rego** (`@hobo/provider-opa` — maps the request to OPA `input`, runs as embedded/WASM/sidecar/Envoy, returns the decision) and **Cedar** (`@hobo/provider-cedar`) for ABAC-style authz. HoBo Cloud is the **management plane** (pack registry, distribution, decision logs); Camps/providers are **enforcement points** — the same decision/enforcement split OPA advocates, but HoBo owns the model.

## Decisions are events
Every `policy.Decided` (effect + evidence + obligations), `policy.ViolationDetected`, `policy.WaiverRequested/Approved`, and obligation lifecycle is an event ([Plan 11](./11-event-model.md)) → a replayable, auditable answer to "*why was this allowed/blocked, under which pack version?*". The Gatekeeper ([Plan 29](./29-contracts-compatibility.md)) composes the policy decision with contracts + evals + conformance + cost into one `hobo verify` result.

## Iteration hooks
- Default pack set + precedence when multiple packs match.
- ~~Obligation tracking SLAs (saga vs projection) and expiry of unmet obligations.~~ **Resolved ([Plan 44](./44-sre-incident-management.md)):** obligations carry a deadline; unmet-by-deadline **escalates** (the on-call ladder), tracked as `policy.ObligationCreated`→`…Satisfied`/escalation events.
- Waiver workflow + who can grant per environment.
- Mutation safety (policy-driven graph mutations must themselves pass contracts/conformance).
