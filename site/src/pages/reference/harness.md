---
layout: ../../layouts/Docs.astro
title: Harness & progressive delivery
description: "Feature flags, experiments, gateway weights, sandbox lanes, and how Harness composes with Trails and Gatekeeper."
---

# Harness & progressive delivery

**Harness** is the flags / progressive delivery / experiments plane. It is **not** a second control plane for infrastructure — it routes **traffic and contract observation** safely.

## Capabilities

| Capability | Role |
|---|---|
| Feature flags | Ranked evaluation with audit |
| Experiments | Bounded exposure with metrics hooks |
| Gateway weights | Shift traffic across revisions/camps |
| Sandbox lanes | Isolate experimental contract observations |
| Delivery composition | Safe rollout steps shared with Trails |

## Rules

1. Baseline subscribers **ignore** sandbox-lane events by default.
2. Flag changes are facts — replayable, not “console memory.”
3. Progressive steps still pass **Gatekeeper** when they mutate infra.
4. Trails compose Harness for cutover; pure flag flips need no Trail.
5. Agents change flags only under RBAC + policy (often require-approval in prod).

## CLI

`hobo feature …` for flag/progressive ops. Observe via `inspect` projections and event replay.

## Testing

- Dual fixtures for flag on/off paths.
- Bridge shadow mode to compare experimental vs baseline.
- Chaos: partial weight shifts must not break session consistency guarantees you claimed.

## Related

[Progressive delivery guide](/HoBo/guide/progressive-delivery/) · [Trails](/HoBo/primitives/trails/) · [Bridge modes](/HoBo/testing/bridge-modes/) · [Identity](/HoBo/reference/identity/)
