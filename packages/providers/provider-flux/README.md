# `@hobo/provider-flux`

Flux **compute** CloudProvider. [Orbit](https://orbit.runonflux.com/) is the **Git-to-Flux** deploy mode (`source: git`), not a fourth topology and not an actor runtime.

| Primitive | Verdict |
|---|---|
| `web` / `api` / `service` | Honest yes |
| `actor` / `data` / `kv` / `queue` / `bucket` | **none** (use Rivet/celld or a data provider) |

Production apply requires OCI digest, signed webhook, authenticated status/logs, paid multi-instance. Rivet **runners** may live here; Rivet **control plane** and celld fleets must not sit on community nodes.

Live public probes fail closed: unsigned `GET /apps/appregister` must be HTTP ≥400. Timeout or network error is a failure, not a skip.
