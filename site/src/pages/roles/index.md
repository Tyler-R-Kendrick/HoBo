---
layout: ../../layouts/Docs.astro
title: Who writes what
description: "HoBo's division of labor: developers write Bindles, platform engineers write Camps/Yards/Junctions, and DevSecOps writes policy — each role owns one artifact."
---

# Who writes what

HoBo splits cleanly along the lines most teams already have. Each role owns exactly one kind of artifact, in code, with its own review lane — and nobody is forced to touch the others'. That separation isn't org-chart tidiness; it's what lets continuous migration run without meetings.

| Role | You write | The artifact answers |
|---|---|---|
| **[Developers](/HoBo/roles/developers/)** | [Bindles](/HoBo/primitives/bindles/) | *What is this app, and what does it need?* |
| **[Platform Engineers](/HoBo/roles/platform-engineers/)** | [Camps](/HoBo/primitives/camps/), [Yards](/HoBo/primitives/yards/), [Junctions](/HoBo/primitives/junctions/) | *Where may apps live, and how are those places run?* |
| **[DevSecOps](/HoBo/roles/devsecops/)** | Policy | *What is allowed — and what may cross a border?* |

## Why the split works

- **The bindle is the contract.** Developers declare resources, wiring, and least-privilege `.allow()` grants in the app itself. Platform and security teams review a diff, not a wiki.
- **Topology is code, owned by the platform.** Camps, yards, and junctions are typed objects in a repo platform engineers control — golden paths instead of ticket queues.
- **Policy is the gate, not a doc.** Security's rules run inside every `hobo up`, every inferred camp approval, and every migration decision. If policy says no, the convergence loop says no — and the refusal is an event you can audit.

## The same loop serves everyone

`hobo up` runs the identical plan → gate → converge pipeline whether the trigger is a developer deploying, a platform engineer rebalancing, or the Dispatcher chasing a cheaper camp. Each role's artifact plugs into a different stage of that one loop — which is why none of them have to coordinate in real time.

Start with your own trailhead:

- [HoBo for Developers](/HoBo/roles/developers/) — pack the bindle, ship, forget infrastructure.
- [HoBo for Platform Engineers](/HoBo/roles/platform-engineers/) — build the map your apps roam.
- [HoBo for DevSecOps](/HoBo/roles/devsecops/) — write the rules of the road.
