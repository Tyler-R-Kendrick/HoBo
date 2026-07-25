---
layout: ../../layouts/Docs.astro
title: The trail map
description: "Where HoBo actually is on the road: pre-release, building through staged gates from local fidelity to multi-cloud, with every surface contract-pinned first."
---

# The trail map

Where is HoBo on the road? Here's the honest itinerary.

| Area | State |
|---|---|
| **Product** | Pre-release. Not yet accepting paying tenants — or freeloading ones. |
| **Developer surface** | The SDK primitives, `hobo` CLI verbs, and MCP surface documented on this site are **contract-pinned**: specified, validated, and stable to learn against. |
| **Implementation** | Progressing through staged build gates (below), each an acceptance record plus a runnable CI lane. |
| **This site** | The canonical developer documentation for the surfaces above — written for humans and agents alike. |

## How the build is staged

Like any sensible journey, one leg at a time. Each stage gate is a set of acceptance criteria with automated checks behind it:

- **S0 — toolchain**: a signed hello-bindle through CI with toolchain guards green. *(The bindle exists and ships.)*
- **S1 — local fidelity**: runtime conformance, offline `hobo dev`, replay == live. *(Camp life works on your laptop, honestly.)*
- **S2 — first cloud + Yard**: first provider, IaC stack model, drift policy decisions. *(The first real home.)*
- **S3 — agent autonomy**: agent-auth scopes promoted with resolved hooks. *(The Crew gets its own keys.)*
- **S4 — multi-cloud**: overlays, Planner, placement — the full multi-cloud gate. *(Yards and Junctions earn their keep; continuous migration gets a bigger map.)*
- **S5 — forge & extensibility**: provider-generation hooks. *(New homes on demand.)*
- **S6 — production hardening**: HA/DR, canary, FinOps. *(Fit for tenants who yell when things break.)*

## What "contract-pinned" means

Design claims here don't stay prose. Public surfaces — SDK signatures, CLI verbs, package namespaces, event families — are pinned by executable contracts and conformance suites, and documented examples are lint-checked against the canonical CLI spec. When something on this site changes, it's because the contract changed, not because the copy drifted.

## Following along

- Watch this site — it tracks the contract surfaces as they land.
- Start learning now: [Getting started](/HoBo/guide/getting-started/) teaches the two primitives that every stage above builds on.
- Building agent tooling? The [agent docs](/HoBo/agents/) and [`llms.txt`](/HoBo/llms.txt) are maintained with the same care as the human docs.
