# hello-bindle production seed fixture

`examples/hello-bindle` is the S0 proof-of-life example that exercises `@hobo/bindles`,
`@hobo/componentize`, and `@hobo/wit`. It builds a deterministic wasm component, OCI descriptor,
and Ed25519-signed artifact envelope for later conformance and CI replay gates.

## Proof modes

| Claim | Mode |
|---|---|
| Deterministic component bytes + digest | **simulated** contract build (walking-skeleton wasm envelope) |
| `wasm-tools validate` shape | **simulated** via `WebAssembly.validate` hermetic guard |
| Wasmtime smoke (`health` → `hello-bindle:ok`) | **simulated** metadata-driven smoke report |
| Ed25519 fixture signing | **simulated** dev fixture key (`hello-bindle-fixture-key`) |
| `runtime-local` execution | **scope-out** — S1 runtime milestone |

## Commands

```bash
SOURCE_DATE_EPOCH=2026-01-01T00:00:00.000Z pnpm exec turbo run build --filter ./examples/hello-bindle
pnpm exec turbo run test --filter ./examples/hello-bindle
```

## Parse, don't validate

`src/parse.ts` is the single parse boundary for `HelloBindleBuildRecord` derived types. Build
lifecycle events (`ComponentBuilt` → `ArtifactSigned` → `ArtifactVerified`) append to the read
store projection; actors emit events and never mutate prior records in place.

## Event architecture

- **Command:** componentize + sign request
- **Events:** `ComponentBuilt`, `ArtifactSigned`, `ArtifactVerified`
- **Actor:** hello-bindle build script
- **Event store / projection / snapshot / read store:** `dist/hello-bindle.build-record.json`
