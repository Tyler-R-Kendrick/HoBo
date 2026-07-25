---
layout: ../../layouts/Docs.astro
title: Meet the primitives
description: "HoBo's four primitives in order of need: Bindles and Camps are essential; Yards and Junctions are for apps that go places."
---

# Meet the primitives

HoBo has exactly four primitives, named for the traveling life, and you meet them **in order of need**. Two are essential — HoBo cannot run without them. Two are advanced — for apps that start collecting regions and clouds.

## The essentials

| # | Primitive | One line | You need it because… |
|---|---|---|---|
| 1 | **[Bindle](/HoBo/primitives/bindles/)** | Your whole app, packed into one provider-agnostic bundle. | No bindle, nothing to host. It's the first thing HoBo looks for and the only thing it ships. |
| 2 | **[Camp](/HoBo/primitives/camps/)** | Where the bindle lives *right now*: one provider + one durable runtime. | No camp, nowhere to live. (Though the Dispatcher can pitch one for you.) |

Bindle first, camp second — that ordering is load-bearing. The bindle refuses to know where it lives; the camp exists to answer exactly that question, temporarily. The gap between them is where [continuous migration](/HoBo/guide/concepts/#continuous-migration) lives: keep the description portable, treat the placement as a standing decision, and the cheapest valid home wins — today and every day after.

## The advanced scopes

| # | Primitive | One line | Reach for it when… |
|---|---|---|---|
| 3 | **[Yard](/HoBo/primitives/yards/)** | One provider's camps under one roof: shared policy, identity, reconciliation. | One camp stops being enough — multi-region, environment fleets, governance. |
| 4 | **[Junction](/HoBo/primitives/junctions/)** | Where yards meet: cross-cloud federation, peer to peer, no shared state. | The journey goes hybrid or multi-cloud, and borders need policies. |

Scopes nest by breadth — **`Bindle ⊂ Camp ⊂ Yard ⊂ Junction`** — and every scope object is plain, typed, composable code. No config dialects; the objects *are* the topology.

## Start walking

- [Getting started](/HoBo/guide/getting-started/) — pack a bindle and pitch a camp in ten minutes.
- [Core concepts](/HoBo/guide/concepts/) — the rest of the vocabulary: the membrane, the event log, agent identity.
