# Architecture evidence — Resource Definitions + Matching + Packs (HOBO-641)

## Parse, don't validate

- Resource pack install flows through `verifyResourcePack` before catalog mutation; failed verification leaves the Yard unchanged.
- Matching consumes a catalog snapshot with content-hash; `match.Decided` records the hash for replay attribution.
- Delta promotion folds `set.Created` + `delta.*` events; invalid transitions throw at the projection boundary.

## Event-driven Set/Delta

- `delta.Opened` → `delta.Updated` → `delta.Applied` produces a new immutable `set.Created` projection.
- Incremental reconcile nodes derive from `diffDeploymentSet(before, after)`.

## Boundaries

| Seam | Upstream | This POC |
|---|---|---|
| Pack install | Registry/signed artifact | `hoboAddResourcePack` |
| Matching | Catalog snapshot | `decideResourceDefinition` |
| Set/Delta | Event log projection | `foldDeploymentProjections` |
| Multi-cloud plan | Per-Camp context | `planMultiCloudShop` |
