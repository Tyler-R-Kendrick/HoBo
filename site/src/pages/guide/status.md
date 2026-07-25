---
layout: ../../layouts/Docs.astro
title: Project status
description: "Where HoBo actually is: an active design suite, executable proofs, staged build gates, and a production package scaffold — no shipped product yet."
---

# Project status

HoBo says what it is, plainly.

| Area | State |
|---|---|
| **Product implementation** | Not shipped. |
| **Design suite** | Active and canonical under [`docs/design/`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/index.md). |
| **Executable proof material** | `src/draft/<kind>/<slug>` packages + repo validation scripts. |
| **Production scaffold** | `packages/` workspace (`@hobo/core`, `wit`, `bindles`, `runtime`, `componentize`, `conformance`, `cli`, …) with structural + architecture gates. |
| **Backlog** | Mirrored durably in [`docs/implementation-plan.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/implementation-plan.md); Linear is the live operational source. |
| **Primary command surface** | The `hobo` CLI, [specified](/HoBo/guide/cli/) before implementation. |

## How work is staged

Production build progresses through **stage gates**, each an acceptance record plus a runnable CI lane:

- **S0 — toolchain**: signed hello-bindle through CI with toolchain guards green.
- **S1 — local fidelity**: runtime-port/component-host/SDK-parity conformance, offline `hobo dev`, replay == live.
- **S2 — first cloud + Yard**: first provider, IaC stack model, drift policy decisions.
- **S3 — agent autonomy**: agent-auth scope promoted with resolved hooks.
- **S4 — multi-cloud**: the five-part multi-cloud gate (overlays, Planner, placement).
- **S5 — forge & extensibility** and **S6 — production hardening**: generation hooks, HA/DR/canary/FinOps decisions.

Each gate's acceptance record lives in the design suite (e.g. [S1](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/build-s1-stage-gate-acceptance.md)), and the corresponding workflows (`s1-stage-gate.yml`, `s2-stage-gate.yml`, …) keep them executable. Launch-readiness records phase through an **M0–M4** model on top.

## What "executable design" means here

Design claims don't stay prose:

- **Draft proofs** (`src/draft/technical-proofs`, `exp-proofs`, `epic-proofs`, `projects`) carry gate-executed examples, notebooks, benches, and cucumber features.
- **Contract records** pin public surfaces (SDK signatures, CLI verbs, package namespaces) with validators like `validate-sdk-contracts` and `docs:cli-lint`.
- **Traceability** (`docs/design/traceability.md`) gates ADR/plan → backlog coverage.
- **Promotion policy**: when a proof is promoted into a production package, the package copy becomes canonical and the proof is frozen — drift fails CI.

## Following along

- Watch the repo on [GitHub](https://github.com/Tyler-R-Kendrick/HoBo) — changes land as small PRs tied to design claims.
- The intent-alignment review register lives in [`GAPS.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/GAPS.md).
- Competitive positioning stays grounded via [`docs/competitors/`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/competitors/index.md).
- Want to contribute? Start with [Contributing](/HoBo/develop/).
