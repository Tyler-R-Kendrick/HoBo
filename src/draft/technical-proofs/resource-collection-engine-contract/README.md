# HOBO-67 resource collection engine contract

This POC proves the run-to-collect seam for the TypeScript reference idiom layer.

- `collectBindleResources(...)` executes a Bindle definition in collection mode and emits a `hobo.manifest/v1`.
- Resource declarations are observed from the `@hobo/bindles` catalog factories.
- Bind edges are captured from component `bind` options or explicit `collect.bind(...)`.
- Used verbs are inferred from resource handle calls and recorded in manifest `allow` / `usage`.
- `bindle.ResourcesCollected` and `bindle.ManifestProduced` facts carry the collected resources, bind keys, manifest, and deterministic content hash.
- Static collection coverage is reconciled through the existing collection-coverage gate so missed branches are surfaced, not silently omitted.
- Network and clock reads through the collection context are sandboxed as ignored side effects so manifest hashes remain deterministic.

Scope stays contract-only: this does not implement the later coverage gate, permission narrowing, non-TS collection, planner consumption, or production runtime hosting.


## Architecture Evidence

This package ships the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`:

- `architecture/` — protobuf data shapes and CUE constraints for Resource Collection Engine Contract.
- `architecture/pacts/` — PACT contract for the package boundary.
- `ADR.md` — parse-don't-validate and event-architecture evidence.
