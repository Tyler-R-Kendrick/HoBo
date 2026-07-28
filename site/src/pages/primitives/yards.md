---
layout: ../../layouts/Docs.astro
title: Yards
description: "The Yard is an advanced HoBo primitive: one provider's camps under one roof — cross-camp policy, identity, reconciliation, and the control plane itself."
---

# Yards

> *The rail yard is where a line's traffic gets sorted. One company's yard, one company's rules.*

The **Yard** is an advanced primitive — you'll know you need one when a single [Camp](/HoBo/primitives/camps/) stops being enough but you're still on one provider. A yard composes **one provider's camps** and carries everything shared across them: cross-camp policy, identity, reconciliation, and provider-global networking. It is also, not coincidentally, where HoBo's control plane lives.

**Day one? You don't need this page.** A bindle and a camp are the whole entry fee — go read [Getting started](/HoBo/guide/getting-started/). Come back when multi-region calls.

## Building a yard

```ts
import { yard } from "hobo/yards";

import prodEast from "./camps/prod-east";
import prodWest from "./camps/prod-west";
import staging from "./camps/staging";

export default yard("aws", { camps: [prodEast, prodWest, staging] });
```

That's the entire authoring surface: a name and the member camps. Cross-camp concerns — promotion policy between staging and prod camps, shared identity, provider-global DNS — attach at the yard scope.

## Rules yards enforce

- **One provider, strictly.** A yard cannot mix providers; the constructor rejects it. Multi-region within a provider = several camps under one yard. Multi-cloud = several yards under a [Junction](/HoBo/primitives/junctions/).
- **At least one camp.** An empty yard isn't a yard; it's a vacant lot.
- **Provider-specific on purpose.** The yard is where provider-native control-plane behavior is allowed to live, so that camps and bindles don't have to know about it.

## When to reach for a yard

- **Multi-region:** `prod-east` and `prod-west` camps behind one policy scope.
- **Environment fleets:** prod, staging, and a herd of ephemeral `pr-*` camps that share identity and promotion rules.
- **Governance:** one place to say "no bindle in this yard may use a non-conformant provider build" and have it enforced across every camp.
- **A bigger map for migrations:** within a yard, the Dispatcher can rebalance bindles *between camps* — chasing regional pricing and reliability without ever crossing a cloud boundary.

## The yard is itself a bindle

HoBo's control plane — Gateway, Planner, Dispatcher, Orchestrator, the whole [architecture](/HoBo/architecture/) — ships *as a bindle*. Self-hosting HoBo is `hobo up./platform --seed` into a camp you own; the only difference between hosted and self-hosted is who runs the yard. No enterprise-edition fork, no second product. Even the landlord lives in a tent.

## Where yards go next

- Crossing clouds: [Junctions](/HoBo/primitives/junctions/).
- What the yard's machinery does all day: [Architecture](/HoBo/architecture/).
