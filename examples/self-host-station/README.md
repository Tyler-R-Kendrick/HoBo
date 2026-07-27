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

## Migration

Existing `HOBO_HOME` with `hobo.broker.json` or bare-metal Yard state:

1. `hobo station init` (imports broker config as Rail when present).
2. Profile gains `defaultStation`; `defaultBrokerUri` remains for back-compat.
3. Activate a non-bootstrap Rail before production posture (`hobo station rails activate <hash>`).
