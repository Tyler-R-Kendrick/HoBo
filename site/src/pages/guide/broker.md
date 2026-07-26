---
layout: ../../layouts/Docs.astro
title: The Conductor
description: "The Conductor — HoBo's brokering authority — decides where your app lives: it brokers bindle/camp/yard/junction placements across providers, spins resources up and down, and enforces policy, contracts, and billing on every decision."
---

# The Conductor

Somebody has to decide. Which provider hosts your bindle. Whether this deploy
is allowed to happen at all, whether it fits the budget, whether it breaks a
contract someone downstream is depending on. Whether the app scales up
tonight or down to zero. In HoBo that somebody is **the Conductor** — the
one who decides which train you're riding. In the technical docs and the
code you'll see it under its precise name, the **broker** (`@hobo/broker`);
same component, working register.

The Conductor decides *only* from the policies it has been configured to
maintain.

## What the Conductor actually does

It takes a brokering request — "place these resources for this
[bindle](/HoBo/primitives/bindles/), in this scope" — and answers with one of
exactly two artifacts:

- a **Resolution Receipt**: per-resource placements (provider, region, SKU,
  price), pinned to a content hash of the provider catalog *and* a content
  hash of the policy set that produced it — and, when a signing key is
  configured, carrying an **Ed25519 signature** so nobody can alter a single
  byte of the evidence without the consumer noticing; or
- a **Resolution Rejection**: machine-readable reasons from a **closed
  rejection catalog**, each naming the enforcement plane that refused
  (`policy`, `contracts`, `billing`, `placement`, `connectors`) and carrying
  a remediation an agent can act on. Rejections get signed too.

Placement is brokered **per resource, across providers**: your API can land
on the provider that's cheapest for compute while your object store lands on
the one that's cheapest for storage, if policy allows both. Spin-up and
spin-down are Conductor commands too (`up` / `down` / `zero`), and accepted
receipts are handed to delivery — rendered as Argo CD Applications and, when
wired to a live Argo CD, submitted straight to its applications API.

## The five planes it wraps

The Conductor is deliberately a *wrapper*. Each enforcement concern sits
behind a port with a default engine wired in and a heavier engine shipped
alongside:

| Plane | What it enforces | Default | Also shipped |
|---|---|---|---|
| **Policy** | placement policy, approvals, junction lockdowns | HoBo's built-in policy packs | **OPA/Rego** — a real Rego decision (`hobo/broker/decision`) with fail-closed semantics |
| **Contracts** | can-deploy compatibility — no placement that breaks a consumer | HoBo's Gatekeeper (PACT-style boundary contracts) | an external Pact broker feed |
| **Billing** | budget, per-resolution spend caps, quotas | in-proc billing policy | a **metered** plane that folds real usage facts into remaining budget |
| **Delivery** | rolling out accepted receipts | rendered Argo CD `Application` documents / in-proc executor | **live Argo CD submission**, fail-closed |
| **Connectors** | which external systems the Conductor may act through | the connector registry (below) | an external catalog |

Policy speaks more than one language: typed TypeScript policy packs by
default, **Rego** when your governance already lives in OPA, Cedar next —
all lowering onto the same decision port, all recording a `policy.Decided`
fact even when the answer is yes. And if the external policy engine is
unreachable, the Conductor **fails closed**: no policy engine, no placement.

One consequence worth spelling out: a rejection tells you *which plane* said
no. "Denied by policy" and "over budget" and "no provider satisfies this
port in an allowed region" are different answers, and agents get them as
different cataloged codes with remediations attached.

## Policies are layered — and lockdowns win

Placement policies attach per scope, and merge from the outside in:
**junction → yard → camp → bindle**. Narrower scopes override the
choice-shaped fields — the objective (`min-cost` or `pinned`), allowed
providers and regions. But *restrictions accumulate*: denied providers stay
denied, and when a [junction](/HoBo/primitives/junctions/) broker admin
requires explicit, approved [camps](/HoBo/primitives/camps/), no
bindle-level policy can switch inference back on. The keys stay held.

## The connector registry

The Conductor acts on the outside world through registered **connectors**:
a HoBo GitHub App, a Pulumi org, an Azure subscription, a Vercel team, a
Cloudflare account, or a custom connector. Each registration carries its
settings and a `credentialRef` — a *pointer* into the token broker, never a
raw secret. Policy can require connector kinds up front: no enabled GitHub
App connector, no resolutions that would need one.

(Yes, HoBo has more than one thing that brokers. The **token broker**
brokers credentials; the Conductor brokers placements. They are deliberately
separate authorities — the Conductor holds no secrets.)

## Everything is an event

Conductor decisions are facts on the event log like everything else:
`broker.Requested`, `broker.Resolved`, `broker.Rejected`,
`broker.ResolutionSigned`, `broker.ScaleRequested`,
`broker.DeliverySubmitted`, `connector.Registered`. The decision views are
folds over that stream — rebuildable from zero, snapshot-cached for reads —
and every policy evaluation records its own `policy.Decided` fact even when
the answer is yes. Ask "why does the app live there?" and the log answers.

## Status

The Conductor ships as the `@hobo/broker` package: the policy set (protobuf
+ CUE constrained), the resolve/scale/deliver pipeline, the layered-policy
merge, the connector registry, the closed rejection matrix, Ed25519-signed
receipts and rejections, the Rego/OPA policy engine adapter, the metered
billing plane, and live Argo CD submission — every external boundary pinned
by a consumer-driven pact. Still ahead: operating it as the hosted
authority, admin-console UX for proposing broker environments, and the
Cedar policy adapter. See [the trail map](/HoBo/guide/status/) for the
honest ledger.
