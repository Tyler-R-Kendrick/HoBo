---
layout: ../../layouts/Docs.astro
title: Stations
description: "Station is the hard control-plane isolation boundary a Conductor occupies — Rails, connections, bootstrap, and fail-closed setup."
---

# Stations

A **Station** is the hard control-plane isolation boundary a Conductor occupies. It is **not** Bindle ⊂ Camp ⊂ Yard ⊂ Junction containment (ADR-0131).

## Owns

| Asset | Role |
|---|---|
| Connections | Authorized dial/control relationships |
| Rails | Content-addressed profiles / pins |
| Bootstrap Rail | Initial trusted profile |
| Local client state | Under `HOBO_HOME/stations/` |

Package: `@hobo/stations` (`station()`, StationService, Rails, local client, Privileged Access Gateway hooks).

## CLI (ops/setup)

```text
hobo station init|up|down|status|rails *
```

These are **ops**, not app lifecycle verbs. Missing Station **fails closed** for control-plane work — run `hobo station init`.

## Profile requirements

| Field | Role |
|---|---|
| `defaultStation` | Which Station is active |
| `activeRail` | Which Rail pins policy/profile |
| `defaultBrokerUri` | Remote Conductor HTTP endpoint only — **not** a setup path |

## Broker relationship

Broker is pure Conductor: receipts pin `stationId` + `railHash`. Cross-Station Connection use fails closed without federation grant.

## PAM

Privileged Access Gateway sessions can be Station-aware — break-glass paths still audit.

## Related

[Control plane](/HoBo/guide/control-plane/) · [Conductor](/HoBo/guide/broker/) · [Connectivity](/HoBo/reference/connectivity/) · [CLI](/HoBo/reference/cli/)
