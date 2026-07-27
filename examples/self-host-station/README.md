# Self-host Station (main setup path)

Station is the hard control-plane isolation boundary a Conductor occupies.
App topology remains Bindle ⊂ Camp ⊂ Yard ⊂ Junction — Station does **not**
contain Yards.

## Offline happy path

```bash
export HOBO_HOME="${HOBO_HOME:-$HOME/.hobo}"
hobo station init
hobo station status
hobo station up
hobo broker matrix
hobo connection list
hobo doctor
# App graph lifecycle (unchanged):
# hobo up
```

## Station Bindle shape

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

Connections and Rails are Station aggregates (not ordinary Bindle graph resources).
`hobo.broker.json`, when present at init time, is imported as an approved Rail under the Station.

## Policy document as Rail

If `HOBO_HOME/hobo.broker.json` exists at init time, it is published and **activated** as the Station's non-bootstrap Rail (bootstrap is demoted). Production occupancy uses that Rail hash on every Conductor receipt.
