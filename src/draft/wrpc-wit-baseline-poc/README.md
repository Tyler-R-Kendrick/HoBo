# wRPC + WIT baseline POC

This draft implements HOBO-12's spike proof: an exact toolchain baseline,
one vendored `wasi:*` interface pin, and a smoke WIT package that `jco types`
and `wit-bindgen-cli` can resolve.

## Decision Snapshot

- Wasmtime / Component Model host floor: `v46.0.1`.
- `@bytecodealliance/jco`: `1.24.3`.
- `@bytecodealliance/componentize-js`: `0.21.0`.
- `wit-bindgen-cli`: `0.58.0`.
- `wrpc`: `0.17.0`.
- wasmCloud lattice integration floor: `v2.4.0`.
- First vendored interface fixture: `wasi:clocks/wall-clock@0.2.0@stable`.

The full rationale is recorded in `ADR-0085`.

## Verification

```powershell
npm.cmd install
npm.cmd test
```

`npm.cmd test` regenerates bindings with the pinned `jco`, runs an exact-version
`wit-bindgen-cli` smoke generation, validates the lock and vendored interface
digest, and checks the generated smoke binding surface.


## Architecture Evidence

This package ships the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`:

- `architecture/` — protobuf data shapes and CUE constraints for Wrpc Wit Baseline Poc.
- `architecture/pacts/` — PACT contract for the package boundary.
- `ARCHITECTURE.md` — parse-don't-validate and event-architecture evidence.
