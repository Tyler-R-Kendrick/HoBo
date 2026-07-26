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
| **Implementation** | Progressing through staged build gates (below), each an acceptance record plus a runnable CI lane. See "What runs today" for the shipped slice. |
| **This site** | The canonical developer documentation for the surfaces above — written for humans and agents alike. |

## What runs today

- **The TypeScript bindle flow.** A project whose `src/bindle.ts` default-exports a `bindle()` runs `hobo collect`, `hobo plan`, `hobo up`, `hobo down`, and `hobo dev` end to end against the default **local, in-memory lane** — no cloud account. `hobo dev` serves the project's own api/web entrypoint handler in-process; a committed `hobo.bindle.json` manifest artifact wins when present.
- **The MCP control surface.** The `hobo-mcp` binary serves all 28 canonical verbs as MCP tools over stdio, dispatching through the same command registry as the CLI, with verb/tool parity contract-tested, deny-by-default auth, and audited decisions. See [the MCP surface](/HoBo/agents/mcp/).
- **Credential-gated live lanes.** Cloudflare and Vercel deploys unlock via env tokens; the real pinned Pulumi CLI engine unlocks via `HOBO_PULUMI_LIVE=1`.
- **Examples in the repo:** `examples/hello-bindle`, `examples/multi-cloud-shop`, `examples/durable-agent`, and `examples/self-host-yard` (operate your own Yard: the control-plane event log on your disk).
- **Not yet shipped:** `@hobo/junctions` (deliberately deferred to the S4 multi-cloud stage) and the fly/aws/azure/gcp provider and postgres runtime packages — pages that show them are marked design-stage.

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
