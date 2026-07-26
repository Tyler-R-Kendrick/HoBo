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
Junction edge) **across providers**, and it is implemented in production scaffold form
by [`@hobo/broker`](../../packages/broker/README.md).

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

| Plane | Enforces | Default engine | Swappable engine |
|---|---|---|---|
| **Policy** | placement policy, approvals, lockdowns | the `@hobo/contracts` policy pack — imported and **run**, not reinvented | OPA/Rego behind the planned `@hobo/provider-opa` adapter ([`contracts-policy-flags.md`](./contracts-policy-flags.md)) |
| **Contracts** | PACT-style boundary compatibility (`can-deploy`) | the `@hobo/contracts` Gatekeeper | an external Pact-broker verification feed |
| **Billing** | budget, per-resolution spend cap, quota | in-proc checks over the broker's `BillingPolicy` | the billing policy plane ([`billing-launch-policy.md`](./billing-launch-policy.md), [`usage-metering.md`](./usage-metering.md)) |
| **Delivery** | rollout of accepted receipts | rendered Argo CD `Application` documents (pure data) or in-proc executor handoff | a live Argo CD control plane / GitOps publisher ([`platform-engineering.md`](./platform-engineering.md)) |
| **Connectors** | which external systems the broker may act through | event-sourced connector registry: `github-app`, `pulumi`, `azure`, `vercel`, `cloudflare`, `custom` | an external connector catalog |

Placement itself consumes the provider catalog through a structural mirror of
`@hobo/cloud`'s `PlannerRegistry`, so the Yard's live, approval-gated
Registry (provider Capability Manifests, cost facts, `catalogHash`) plugs in
directly — registered-but-unapproved providers stay invisible to matching.

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

## Follow-up gates

- Ed25519 receipt signing wired to the HOBO-529 receipt-integrity evidence.
- The `@hobo/provider-opa` policy-engine adapter behind the gate plane port.
- Metering-backed billing plane (usage facts instead of static policy fields).
- Live Argo CD submission behind the delivery plane port (rendered
  `Application` documents are the current contract surface).
- `hobo` CLI verbs that surface broker receipts/rejections directly.
