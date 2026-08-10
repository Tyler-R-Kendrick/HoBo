---
type: Reference
title: "Anonymous and claimable hosting delivery state"
description: "Stack topology and closeout evidence for ADR-0151 implementation."
tags: [hobo, plans, sdlc, anonymous, claims]
---

# Initiative: anonymous and claimable hosting

**Phase:** complete
**Slug:** `anonymous-claimable-hosting`

## Goal

Land ADR-0151 capability profiles, durable claim semantics, provider adapters,
and the Try HoBo experience as reviewable dependency-ordered pull requests.

## Stack topology

1. `sdlc/anonymous-hosting-01-foundations` — capability, binding, claim, trust, and durable ownership contracts.
2. `sdlc/anonymous-hosting-02-realizations` — portable data, KV, and OCI realization packs.
3. `sdlc/anonymous-hosting-03-resolution` — recipes, capability resolution, conformance, and architecture guidance.
4. `sdlc/anonymous-hosting-04-providers` — claimable data-provider adapters.
5. `sdlc/anonymous-hosting-05-edge-providers` — claimable edge-host adapters.
6. `sdlc/anonymous-hosting-06-runtime-providers` — portable runtime-host adapters.
7. `sdlc/anonymous-hosting-07-integration` — HoBo runtime, CLI, and app-framework integration.
8. `sdlc/anonymous-hosting-08-experience` — examples, site, proofs, generated docs, and operational guidance.

## Closeout

The stack was independently reviewed, validated, and squash-merged bottom-up:

1. [#1055](https://github.com/Tyler-R-Kendrick/HoBo/pull/1055) — `b1cd693c33d72e50e4fd831144a7a2b4c6d9a27a`
2. [#1056](https://github.com/Tyler-R-Kendrick/HoBo/pull/1056) — `cc8b4eb5f79fbc0e9c5cea630651c98f7bb73417`
3. [#1057](https://github.com/Tyler-R-Kendrick/HoBo/pull/1057) — `3f070358a29a551b691c62d2d554f3ef8ebfaba6`
4. [#1058](https://github.com/Tyler-R-Kendrick/HoBo/pull/1058) — `f475fc8897d23082e2221e438f58d1ee19d19e86`
5. [#1059](https://github.com/Tyler-R-Kendrick/HoBo/pull/1059) — `260b2d420b3db0a4ee3c44952edf46fbed5b9496`
6. [#1060](https://github.com/Tyler-R-Kendrick/HoBo/pull/1060) — `bef6bceaa759d9d4971c9739dc1bc6d2756b64eb`
7. [#1061](https://github.com/Tyler-R-Kendrick/HoBo/pull/1061) — `506e4004bd53c1ad73b33b6c6ee58f14f3219574`
8. [#1062](https://github.com/Tyler-R-Kendrick/HoBo/pull/1062) — `136dac94dabec0fc36b4798b75a36902e5b7bafb`

Validation: `pnpm agent:check -- --base=origin/main` passed 21 relevant checks
on the cumulative stack, and `pnpm --prefix examples/try-site test` passed all
4 tests. GitHub had no unresolved review threads; subsequent CodeRabbit reviews
were unavailable because the free-plan review limit was reached.
