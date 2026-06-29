# @hobo/core contract POC

HOBO-2 pins the shared contract surface that other packages compile against.
This POC keeps the work intentionally contract-only:

- Capability Manifest bundle schema for `index.json`, `capabilities.json`, `auth.json`, and `cost.json`.
- `EventEnvelope` helpers plus CloudEvents, OCSF, and OTLP boundary mappings.
- Runtime/provider port descriptors and a minimal DI container.
- Public declaration snapshot guard that rejects accidental provider-specific symbols in `@hobo/core`.

It does not implement runtime behavior, provider adapters, or the WIT package.


## Architecture Evidence

This package ships the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`:

- `architecture/` — protobuf data shapes and CUE constraints for Hobo Core Contract.
- `architecture/pacts/` — PACT contract for the package boundary.
- `ARCHITECTURE.md` — parse-don't-validate and event-architecture evidence.
