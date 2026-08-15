# `@hobo/stations`

**Station** is the hard control-plane isolation boundary a Conductor occupies
([ADR-0131](../../docs/design/adr/01-architecture-core.md#adr-0131)). App topology
stays **Bindle ⊂ Camp ⊂ Yard ⊂ Junction** — Station does **not** contain Yards.

This package owns Station aggregates, Rails (content-addressed profiles), local
Station client under `HOBO_HOME/stations/`, and StationService fold/events.

## Install / consume

Workspace package. Prefer importing from `@hobo/stations` after monorepo build:

```ts
import {
  station,
  initStation,
  createStationClient,
  createBootstrapRail,
  StationService,
} from "@hobo/stations";
```

## Authoring

```ts
import { station } from "@hobo/stations";

export const acme = station("acme-platform", {
  isolation: {
    tenant: "acme",
    residency: "us",
    airgap: false,
    trustDomain: "acme.hobo.local",
  },
  rails: ["rail-prod"],
});
```

CLI (ops/setup, not lifecycle verbs): `hobo station init|up|down|status|rails *`.

## Station capabilities (ADR-0155)

`stationCapability()` declares a schema-versioned facility a Station offers its
occupants (`hobo.station-capability/v1`; closed kind vocabulary; provenance
`default | discovered | declared`); declarations attach via
`station(..., { capabilities })`. `matchStationCapabilities()` matches a
declared set against host observations **fail-closed** (declared-but-unobserved
is missing) and produces a `hobo.station-capability-manifest/v1`, persisted
beside the Station data (`stationCapabilitiesPath` →
`HOBO_HOME/stations/<id>/capabilities.json`). Consumed by `hobo-code init`
machine discovery — see `docs/design/stations.md`.

```ts
import { matchStationCapabilities, stationCapability } from "@hobo/stations";

const git = stationCapability({
  kind: "vcs",
  slug: "git",
  title: "git on PATH",
  required: true,
  remediation: "install git",
});
const manifest = matchStationCapabilities({
  stationId: "station:local",
  declared: [git],
  observations: [
    { capabilityId: git.id, present: true, evidence: ["bin:/usr/bin/git"] },
  ],
});
```
Missing Station fails closed — run `hobo station init`. See
[`examples/self-host-station`](../../examples/self-host-station/README.md).

## Traffic routing synthesis

`applyRoutingObservations` merges provider `observe.health` / `observe.location`
signals into a topology before synthesis. Missing signals stay best-effort
(degraded notes); confirmed health/location can yield a non-degraded plan.

`synthesizeRoutingPlan` is the pure Station-side bridge from a portable topology
snapshot plus an existing `PolicyDecision` to a parsed `RoutingPlan`. Missing
Station context, a mismatched/denied policy decision, or a confirmed minimum-
availability violation returns a typed denial. Known-unhealthy backends are
excluded; unknown health/location signals produce a degraded best-effort plan
with explicit notes. Synthesis does not call clouds or take ownership of Junction overlay configuration. See
[ADR-0143](../../docs/design/adr/07-portability-extensibility.md#adr-0143).

## Honesty

- Control-plane isolation primitive; not a multi-tenant hosted product by itself.
- Privileged access gateway helpers re-export from `@hobo/connectivity` where applicable.
- Live multi-Station federation remains out of this package’s local client path.

## Scripts

```sh
pnpm --filter @hobo/stations test
pnpm --filter @hobo/stations build
```

## Related

- `@hobo/broker` — pure Conductor (receipts pin `stationId` + `railHash`)
- `@hobo/connectivity` — overlay / PAM / policy foundations
- Design: ADR-0131, package map in `docs/design/package-namespaces.md`
