# @hobo/stations — Architecture Evidence

Station is the **control-plane occupancy primitive**: the durable isolation-bound
environment a Broker (Conductor) occupies. It is **not** app-topology containment
(Bindle ⊂ Camp ⊂ Yard ⊂ Junction).

## Schema and constraints

- Protobuf records live in [`data-models/station.proto`](./data-models/station.proto).
- CUE constraints bound every protobuf type in [`data-models/station.cue`](./data-models/station.cue).
- PACT consumer evidence lives under [`contracts/pacts/`](./contracts/pacts/).

## Parse, don't validate

Untrusted Station / Rail input crosses parser boundaries in `station()`,
`createRail()`, and `initStation()` into deep-frozen derived domain types
(`Station`, `Rail`, `StationOccupancy`). Downstream Conductors receive those
parsed types, not raw config objects.

## Event architecture

- **Command** — `station init`, rail publish/approve/activate, close Station.
- **Event** — `station.Created` / `Configured` / `Closed` / `IdentityRotated`,
  `rail.Published` / `Approved` / `Activated` / `Deactivated` / `Retired`.
- **Actor** — `StationService` owns the Station aggregate and Rail catalog.
- **Event store** — Station partition under `HOBO_HOME/stations/<id>/events.jsonl`.
- **Materialized view / projection** — pure `foldStationEvents` rebuild-from-zero.
- **Snapshot** — occupancy + rails map is the projection snapshot.
- **Read store** — `StationClient` serves occupancy, active Rail, and receipt pins
  (`stationId`, `railHash`) without replaying when folded once.

## Layering

Stations depend only on `@hobo/core`. Identity Connections attach `stationId`;
Broker mounts a Station client as pure Conductor (no durable Connection store).
