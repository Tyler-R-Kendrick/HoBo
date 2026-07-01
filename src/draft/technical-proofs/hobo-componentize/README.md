# @hobo/componentize draft POC (HOBO-584)

Independent draft proof for S0-07: TypeScript service → wasm component → OCI artifact via pinned `jco` + `componentize-js`.

Promotion target: `packages/componentize/` once S0-06 (`@hobo/wit`) lands on `main`.

## Determinism controls

- `SOURCE_DATE_EPOCH` from the parsed spec
- sorted `src/**/*.ts` source listing with per-file `sha256:` digests
- workspace path remap to `/workspace/<name>` under a canonical temp root
- exact toolchain pins (`jco@1.24.3`, `componentize-js@0.21.0`, `wasm-tools@1.235.0`, `wasmtime@46.0.1`)

## Public API

- `parseComponentizeSpec(raw)` — single parse boundary
- `componentizeService(spec)` — real `componentize-js` build
- `validateWasmComponentArtifact(artifact)` — component-model guard + digest check
- `buildOciDescriptor(artifact, title)` — canonical OCI manifest JSON
- `runComponentSmoke(artifact, { exportName })` — jco transpile smoke

## Parse, don't validate

Untrusted input crosses only `parseComponentizeSpec`. Downstream modules accept the derived `ComponentizeSpec` / `WasmComponentArtifact` types; invalid values are unrepresentable past the parser boundary. CUE constraints in `data-models/componentize.cue` bound the same shapes.

## Event architecture

- **Command** — `ComponentBuildRequested`
- **Event** — `ComponentBuilt` (append-only; carries component digest, OCI manifest digest, toolchain pin, source digests)
- **Actor** — componentize build actor applies the command and emits `ComponentBuilt`
- **Event store** — append-only build event log
- **Projection / materialized view** — `ComponentizeResult` snapshot
- **Snapshot** — returned `component` + `oci` descriptor
- **Read store** — consumers query the snapshot; actors never mutate read models in place

## Verification

```bash
pnpm --prefix src/draft/technical-proofs/hobo-componentize test
```

Scoped CI (`componentize.yml`) installs pinned `wasm-tools@1.235.0` for component validation and double-build digest checks.

## Architecture evidence

- `data-models/` — protobuf + CUE constraints
- `contracts/pacts/` — componentize build boundary pact
- `ADR.md` — parse/event evidence prose
