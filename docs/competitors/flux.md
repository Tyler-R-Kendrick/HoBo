# Flux / Orbit

**Checked:** 2026-08-14  
**Sources:** [orbit.runonflux.com](https://orbit.runonflux.com/), [docs.runonflux.com](https://docs.runonflux.com/)  
**HoBo role:** `@hobo/provider-flux` compute target. Orbit is **Git-to-Flux mode**, not its own provider.

## Impedance

| Fact | HoBo consequence |
|---|---|
| Community nodes, variable QoS | Policy: no secrets/control-plane/regulated data on community-free |
| Lease volumes ≠ actor storage | Never map `data`/`kv`/`actor` to a folder |
| n8n docs forbid live PG dir sync | No generic HA database from replica count |
| Webhook signature optional; `/status` and `/health` public unless `API_KEY` | Production apply fails closed. Do not claim a public HTTP `/logs` route. |
| ArcaneOS attestation proprietary | Evidence class, not a guarantee |
| Firebase/Stripe in Orbit UX | Hosting can be decentralized while gatekeepers remain |

Prices are ranking input (`COST_SOURCE` + date), never billing.

## HoBo mapping

| Primitive | Suitability |
|---|---|
| `web` / `api` / `service` | Yes |
| `actor` | Indirect: Rivet **runners** only |
| `data` / `kv` / `queue` / `bucket` | External providers |

Recipe `rivet-runners-on-flux`: trusted-yard control plane, outbound Flux runners.
