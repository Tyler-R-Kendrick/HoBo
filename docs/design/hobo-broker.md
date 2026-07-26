---
type: Reference
title: "HoBo Broker"
description: "Runtime architecture of the HoBo Broker: policy-governed brokering of Bindle/Camp/Yard/Junction placements across providers, wrapping the policy (OPA-shaped), contract (Gatekeeper/PACT), billing, delivery (Argo), and connector-registry planes."
tags: [hobo, design]
---

# HoBo Broker

The **HoBo Broker** is the runtime brokering authority: it decides where apps
are hosted, spins resources up and down, and hands accepted placements to
delivery — **based on the configured policies the broker itself maintains**.
It brokers the full topology vocabulary (Bindle → Camp → Yard → Junction,
[ADR-0026](./adr/01-architecture-core.md#adr-0026) containment with
[ADR-0043](./adr/07-portability-extensibility.md#adr-0043) federation at the
Junction edge) **across providers**, and it is implemented by
[`@hobo/broker`](../../packages/broker/README.md).

**Naming.** Technical documentation, code, and wire contracts say **broker**
— the term is precise about what the component does. Product surfaces (the
site, marketing copy) brand this same component **the Conductor**. One
component, two registers; never introduce a third name.

Where [`meta-cloud-broker.md`](./meta-cloud-broker.md) records the M0 scope
and acceptance evidence for the *hosted* broker authority (Contract Manifests
validated against Broker Environments, receipts and rejections as evidence
artifacts), this document specifies the broker's *runtime* shape: what it
wraps, in what order it enforces, and which events it emits. The two describe
one authority at two altitudes; the artifact vocabulary (Resolution Receipt,
Resolution Rejection) is shared, per the [glossary](./glossary.md).

## Three brokers, never conflated

The design suite names three brokers with disjoint responsibilities. This
page is about the first; the distinction is a standing adversarial
requirement and must survive every edit:

| Broker | Brokers what | Where specified |
|---|---|---|
| **HoBo Broker** (this doc) / Meta-cloud Broker | *Placements*: which provider hosts which resource, under which policy | this doc, [`meta-cloud-broker.md`](./meta-cloud-broker.md) |
| **Token broker** (Identity) | *Credentials*: SVID → short-lived provider tokens | [ADR-0008](./adr/02-identity-security.md#adr-0008), [`ai-native-agent-auth.md`](./ai-native-agent-auth.md) |
| **Connector runtime broker** | *User-delegated access*: XAA / ID-JAG token exchange for external SaaS | HOBO-235 proof record |

The HoBo Broker's connector registry stores `credentialRef` **pointers into
the token broker** — never credentials. Placement authority and credential
authority stay separate.

## What the broker wraps

The broker is a wrapper around five planes. Each is a port so an engine can
be swapped without touching the brokering pipeline:

| Plane | Enforces | Default engine | Alternate engine (shipped) |
|---|---|---|---|
| **Policy** | placement policy, approvals, lockdowns | the `@hobo/contracts` policy pack — imported and **run**, not reinvented | OPA/**Rego** via `createOpaGatePlane` (see §Policy languages); Cedar is the next adapter per [`contracts-policy-flags.md`](./contracts-policy-flags.md) |
| **Contracts** | PACT-style boundary compatibility (`can-deploy`) | the `@hobo/contracts` Gatekeeper | an external Pact-broker verification feed (port-compatible) |
| **Billing** | budget, per-resolution spend cap, quota | in-proc checks over the broker's `BillingPolicy` | metered plane via `createMeteredBillingPlane`, folding `meter.UsageRecorded` facts ([`usage-metering.md`](./usage-metering.md), [`billing-launch-policy.md`](./billing-launch-policy.md)) |
| **Delivery** | rollout of accepted receipts | rendered Argo CD `Application` documents (pure data) or in-proc executor handoff | live Argo CD submission via `createArgoCdDeliveryPlane` (applications API, fail-closed, token via the token broker) |
| **Connectors** | which external systems the broker may act through | event-sourced connector registry: `github-app`, `pulumi`, `azure`, `vercel`, `cloudflare`, `custom` | an external connector catalog |

Placement itself consumes the provider catalog through a structural mirror of
`@hobo/cloud`'s `PlannerRegistry`, so the Yard's live, approval-gated
Registry (provider Capability Manifests, cost facts, `catalogHash`) plugs in
directly — registered-but-unapproved providers stay invisible to matching.

## Policy languages

Enforcement uses three languages, each where it is strongest:

1. **Typed TypeScript policy packs (the HoBo Policy IR)** — the default and
   the decision *model*. Rules are `definePolicyRule` predicates over Policy
   IR decision requests; every evaluation lowers onto `policy.Decided` facts
   (allow included), so governance is recorded by default.
2. **Rego (OPA)** — the first-class external policy language, shipped as
   `createOpaGatePlane`. The broker maps its Policy IR decision request onto
   an OPA `input` document and queries the OPA Data API decision at
   **`hobo/broker/decision`**:

   ```rego
   package hobo.broker

   default decision := {"effect": "deny", "reasons": [{
     "code": "policy-denied",
     "message": "no rule allowed this resolution"}]}

   decision := {"effect": "allow", "reasons": [],
                "policyIds": ["hobo.rego/placement-allow"]} if {
     input.request.action == "hobo:broker:resolve"
     input.costQuota.used < input.costQuota.limit
     not frozen[input.request.resource.id]
   }

   decision := {"effect": "deny", "policyIds": ["hobo.rego/change-freeze"],
                "reasons": [{"code": "policy-denied",
                             "message": "change freeze in effect"}]} if {
     frozen[input.request.resource.id]
   }
   ```

   The result document is `{ effect, reasons: [{code, message, plane?}],
   policyIds? }`, parse-don't-validated back onto the engine-neutral gate
   decision. The adapter **fails closed**: transport errors, non-200s, and
   missing results deny with `policy-engine-unavailable` — an unreachable
   policy engine never allows. OPA can run embedded, as a WASM bundle, a
   sidecar, or remote; the boundary is pinned by the
   `broker_policy_opa.pact.json` contract either way.
3. **Cedar** — the second external language the policy-engine port accepts
   (ABAC-style authz, `@hobo/provider-cedar` per
   [`contracts-policy-flags.md`](./contracts-policy-flags.md)); it lowers
   onto the same gate-decision port the Rego adapter uses.

**CUE is not a decision language here** — it is the *invariant* language:
`data-models/broker.cue` constrains every wire shape (dependent constraints
like "pinned objective must name its provider", "engine argo requires a
GitOps repo", "scale-to-zero means zero replicas"), so malformed policy or
request documents never reach any engine.

## Broker policies

The broker maintains one `BrokerPolicySet` (protobuf + CUE constrained,
`packages/broker/data-models/`): placement policies per scope kind, a billing
policy, a delivery policy, and required connector kinds. Placement policies
merge **junction → yard → camp → bindle**:

- narrower scopes override *choice-shaped* fields — objective (`min-cost` or
  `pinned`), allowed providers, allowed regions, provider pins;
- *restrictions accumulate outward-in* — denied providers union, and a
  junction broker admin's `require_explicit_camps` lockdown can never be
  relaxed by a narrower policy. This is the documented "junction broker
  admin holds the keys" behavior: with lockdown on, a request that names no
  explicit Camp is rejected with `explicit-camp-required`.

Every receipt and rejection pins `policy_hash` (content address of the whole
policy set) and `catalog_hash`, so any decision replays against exactly the
policies and catalog that produced it — the same integrity discipline the
Meta-cloud Broker receipt evidence requires (HOBO-529).

## The resolve pipeline

A brokering request (`BrokerRequest`: topology scope + per-resource port and
feature requirements + spend estimate) flows through the planes in a fixed
order; the first failing plane rejects with machine-readable, per-plane
reasons:

1. **Connectors** — every required connector kind must be registered and
   enabled (`connector-missing`).
2. **Placement policy selection** — no applicable policy, no placement
   (`no-placement-policy`); lockdown check (`explicit-camp-required`).
3. **Gatekeeper** — the composed policy + contract-compatibility +
   obligations + quota gate from `@hobo/contracts`; its `policy.Decided` and
   `gatekeeper.Decided` facts are appended to the broker's event stream.
4. **Billing** — spend estimate vs the per-resolution cap
   (`spend-cap-exceeded`) and remaining budget (`budget-exceeded`).
5. **Placement** — each requirement is matched against the catalog under the
   effective policy (denied/allowed providers, allowed regions, full
   capability satisfaction), then ranked by the objective: `min-cost` picks
   the lowest marginal price with a deterministic provider-id tiebreak;
   `pinned` requires the pinned provider (`pinned-provider-unavailable`).
   Different resources may land on different providers — brokering is
   per-resource, across providers.

Acceptance emits a `ResolutionReceipt`; refusal emits a
`ResolutionRejection`. Spin-up/spin-down is a separate command
(`ScaleDirective`: `up` / `down` / `zero`, with `zero` ⇒ 0 replicas enforced
as a CUE dependent constraint), and delivery of an accepted receipt goes
through the delivery plane (`broker.DeliverySubmitted`).

## Receipt integrity (Ed25519)

When the broker holds a signing key, every receipt **and** every rejection
carries a detached **Ed25519** signature (`ResolutionSignature` in
`data-models/broker.proto`) over the resolution's canonical JSON form
(recursively key-sorted, whitespace-free), plus a `sha256:` payload digest,
recorded as a `broker.ResolutionSigned` fact. A consuming Yard verifies with
`verifyResolution` before acting; changing one byte of placement evidence —
a provider id, a price, the policy hash — fails verification. This is the
HOBO-529 receipt-integrity requirement as running code.

## The rejection matrix

Rejection codes are a **closed catalog** (`REJECTION_MATRIX`), each pinned
to its owning plane and an agent-actionable remediation; a test asserts every
broker reject path emits a cataloged code, so the matrix cannot drift from
the pipeline (the HOBO-528 rejection-matrix requirement as running code).
`contracts`-plane codes are owned by the `@hobo/contracts` compat gate.

| Code | Plane | Remediation (abridged) |
|---|---|---|
| `connector-missing` | connectors | register + enable the required connector kind |
| `no-placement-policy` | policy | configure a policy for the request's scope kind |
| `explicit-camp-required` | policy | name an explicit approved camp (lockdown active) |
| `policy-denied` | policy | denied by pack/Rego decision; amend via governance |
| `policy-engine-unavailable` | policy | external engine unreachable; broker failed closed |
| `approval-required` / `obligation-pending` | policy | obtain approval / satisfy obligations |
| `quota-exceeded` | billing | quota window exhausted; raise via billing governance |
| `spend-cap-exceeded` | billing | lower estimate or raise the per-resolution cap |
| `budget-exceeded` | billing | static or metered budget cannot cover the estimate |
| `no-eligible-provider` | placement | approve a provider / widen regions / drop feature |
| `pinned-provider-unavailable` | placement | unpin or pin a capable provider |

## Event families and read models

Commands in, facts out — the broker is an actor over the event store and
never mutates a read model directly:

- `broker.Requested` → `broker.Resolved` | `broker.Rejected`
- `broker.ScaleRequested`
- `broker.DeliverySubmitted`
- `connector.Registered` / `connector.Disabled`

Read models are pure folds (`foldBrokerDecisions`,
`foldConnectorRegistry`) into materialized views, rebuildable from zero, with
snapshot/restore to a read store for cached current reads.

## Authority boundaries

Unchanged from the Meta-cloud Broker record: the broker **decides and
evidences**; it does not run IaC, hold rollout state, or issue credentials.
The Yard consumes receipts and executes through its orchestrator/executor;
the Gatekeeper remains the composed gate the broker runs, not a boundary it
rewrites; the Admin Console proposes Broker Environments but the broker
validates against approved state only.

## Verification

```sh
pnpm --filter @hobo/broker test
pnpm --filter @hobo/broker test:contract:consumer
```

The consumer-driven PACT contract for the resolve boundary is
[`broker_resolution.pact.json`](../../packages/broker/contracts/pacts/broker_resolution.pact.json).

## Delivered beyond M0

The M1–M3 runtime capabilities of the meta-cloud-broker ladder now ship in
`@hobo/broker`: deterministic per-resource resolution with content-hash
pinning (M2), the closed rejection matrix (M3, HOBO-528), Ed25519 receipt
integrity (M3, HOBO-529), the Rego/OPA policy engine behind the gate plane,
the metered billing plane, and live Argo CD submission behind the delivery
plane — each boundary pinned by its own pact
(`broker_resolution`, `broker_policy_opa`, `broker_delivery_argocd`).

## Follow-up gates

- Operating the broker as the *hosted* authority (the M4 GA handoff:
  deployment, on-call, tenancy) — an operational milestone, not a code gap.
- Admin Console UX for proposing Broker Environments (deferred there by the
  Admin Console M0 record).
- The Cedar (`@hobo/provider-cedar`) adapter behind the same gate-plane port.
- `hobo` CLI verbs that surface broker receipts/rejections directly (the
  27-verb surface is contract-pinned; extending it is its own change).
