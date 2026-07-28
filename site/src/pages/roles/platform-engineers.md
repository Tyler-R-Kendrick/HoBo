---
layout: ../../layouts/Docs.astro
title: HoBo for Platform Engineers
description: "Platform engineers write Camps, Yards, and Junctions — the typed, versioned map of where apps may live and how those places are run."
---

# HoBo for Platform Engineers

**You write [Camps](/HoBo/primitives/camps/), [Yards](/HoBo/primitives/yards/), and [Junctions](/HoBo/primitives/junctions/).** Developers describe apps; you build the map those apps roam: which providers are approved, what a production campsite looks like, how a provider's camps are governed together, and how clouds federate.

## Your artifacts

```ts
// A camp: one provider + one durable runtime — a place an app can live
import { camp } from "hobo/camps";
import { aws } from "hobo/providers/aws";
import { postgresRuntime } from "hobo/runtimes/postgres";
import app from "../apps/my-app/bindle";

export const prodEast = camp("prod-east", {
 bindle: app,
 runtime: postgresRuntime({ url: process.env.DATABASE_URL }),
 defaultProvider: aws({ region: "us-east-1" }),
});
```

```ts
// A yard: one provider's camps under shared policy, identity, reconciliation
import { yard } from "hobo/yards";
export const awsYard = yard("aws", { camps: [prodEast, prodWest, staging] });

// A junction: yards federated across clouds — peer to peer, no shared state
import { junction } from "hobo/junctions";
export default junction("acme", { yards: [awsYard, azureYard] });
```

## What you own

- **The approved-provider set.** Camp inference draws only from providers you've approved — the Dispatcher optimizes for price *inside your fence*, never outside it.
- **Golden-path camps.** Templates for prod/staging/preview with the runtime backend, region defaults, and env semantics already decided. App teams get paved roads, not tickets.
- **Yard-level governance.** Promotion rules between camps, shared identity, provider-global networking, drift posture (`hobo drift`), and reconciliation cadence.
- **Junction federation.** Which clouds peer, what connectivity is inferred, and which [policy packs](/HoBo/roles/devsecops/) apply at each border. You also hold the broker-admin switch: leave camp inference on, or lock placement down to explicit, approved camps.
- **The self-hosting decision.** The Yard control plane is itself a bindle — run HoBo's control plane in your own camp with the same tooling app teams use (`hobo up./platform --seed`).

## Your loop

```sh
hobo plan --camp prod-east # dry-run any change before it lands
hobo verify # preflight the unified gate decision
hobo drift # report drift; route governed remediation
hobo add # install providers after signature + conformance checks
hobo import # adopt an existing estate in place — never destroy/recreate
```

## Continuous migration is your dial

The Dispatcher rebalances bindles between the camps you defined, within the providers you approved, under the policy your [security team](/HoBo/roles/devsecops/) wrote. Widen the map (more camps, more yards, a junction) and migrations get more room to save money; tighten it and placement becomes fully deliberate. Either way, every move runs the same `hobo up` convergence loop and lands in the same event log.
