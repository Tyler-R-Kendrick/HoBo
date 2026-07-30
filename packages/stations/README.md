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
Missing Station fails closed — run `hobo station init`. See
[`examples/self-host-station`](../../examples/self-host-station/README.md).

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
