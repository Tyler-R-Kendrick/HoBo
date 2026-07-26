---
layout: ../../layouts/Docs.astro
title: The Broker
description: "The HoBo Broker is the policy-governed decision authority: it brokers bindle/camp/yard/junction placements across providers, spins resources up and down, and wraps the policy, contract, billing, delivery, and connector planes."
---

# The Broker

Somebody has to decide. Which provider hosts your bindle. Whether this deploy
is allowed to happen at all, whether it fits the budget, whether it breaks a
contract someone downstream is depending on. Whether the app scales up
tonight or down to zero. In HoBo that somebody is the **Broker** — and it
decides *only* from the policies it has been configured to maintain.

## What the broker actually does

The broker takes a brokering request — "place these resources for this
[bindle](/HoBo/primitives/bindles/), in this scope" — and answers with one of
exactly two artifacts:

- a **Resolution Receipt**: per-resource placements (provider, region, SKU,
  price), pinned to a content hash of the provider catalog *and* a content
  hash of the policy set that produced it, so every decision is replayable
  and auditable; or
- a **Resolution Rejection**: machine-readable reasons, each naming the
  enforcement plane that refused (`policy`, `contracts`, `billing`,
  `placement`, `connectors`) — precise enough for an agent to self-correct
  against.

Placement is brokered **per resource, across providers**: your API can land
on the provider that's cheapest for compute while your object store lands on
the one that's cheapest for storage, if policy allows both. Spin-up and
spin-down are broker commands too (`up` / `down` / `zero`), and accepted
receipts are handed to delivery.

## The five planes it wraps

The broker is deliberately a *wrapper*. Each enforcement concern sits behind
a port with a default engine wired in and a heavier engine it can swap to:

| Plane | What it enforces | Default | Swaps to |
|---|---|---|---|
| **Policy** | placement policy, approvals, junction lockdowns | HoBo's built-in policy packs | OPA/Rego |
| **Contracts** | can-deploy compatibility — no placement that breaks a consumer | HoBo's Gatekeeper (PACT-style boundary contracts) | an external Pact broker feed |
| **Billing** | budget, per-resolution spend caps, quotas | in-proc billing policy | the metering-backed billing plane |
| **Delivery** | rolling out accepted receipts | rendered Argo CD `Application` documents / in-proc executor | a live Argo CD control plane |
| **Connectors** | which external systems the broker may act through | the connector registry (below) | an external catalog |

One consequence worth spelling out: a rejection tells you *which plane* said
no. "Denied by policy" and "over budget" and "no provider satisfies this
port in an allowed region" are different answers, and agents get them as
different codes.

## Policies are layered — and lockdowns win

Placement policies attach per scope, and merge from the outside in:
**junction → yard → camp → bindle**. Narrower scopes override the
choice-shaped fields — the objective (`min-cost` or `pinned`), allowed
providers and regions. But *restrictions accumulate*: denied providers stay
denied, and when a [junction](/HoBo/primitives/junctions/) broker admin
requires explicit, approved [camps](/HoBo/primitives/camps/), no
bindle-level policy can switch inference back on. The keys stay held.

## The connector registry

The broker acts on the outside world through registered **connectors**:
a HoBo GitHub App, a Pulumi org, an Azure subscription, a Vercel team, a
Cloudflare account, or a custom connector. Each registration carries its
settings and a `credentialRef` — a *pointer* into the token broker, never a
raw secret. Policy can require connector kinds up front: no enabled GitHub
App connector, no resolutions that would need one.

(Yes, HoBo has more than one thing called a broker. The **token broker**
brokers credentials; the **Broker** on this page brokers placements. They
are deliberately separate authorities — the placement broker holds no
secrets.)

## Everything is an event

Broker decisions are facts on the event log like everything else:
`broker.Requested`, `broker.Resolved`, `broker.Rejected`,
`broker.ScaleRequested`, `broker.DeliverySubmitted`,
`connector.Registered`. The decision views are folds over that stream —
rebuildable from zero, snapshot-cached for reads — and every policy
evaluation records its own `policy.Decided` fact even when the answer is
yes. Ask "why does the app live there?" and the log answers.

## Status

The broker ships today as the `@hobo/broker` package: the policy set
(protobuf + CUE constrained), the resolve/scale/deliver pipeline, the
connector registry, the layered-policy merge, and the plane ports with their
in-proc defaults — contract-tested against a consumer-driven pact. The OPA
adapter, metering-backed billing, and live Argo submission are
design-stage — the ports exist, those engines aren't wired yet. See
[the trail map](/HoBo/guide/status/) for the honest ledger.
