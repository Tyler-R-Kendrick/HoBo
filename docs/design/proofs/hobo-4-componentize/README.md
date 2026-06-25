# HOBO-4 Componentize Proof

HOBO-4 is proven by the focused POC at [`src/draft/hobo-componentize-contract`](../../../../src/draft/hobo-componentize-contract/README.md).

Acceptance mapping:

- `hello-bindle` builds into a deterministic wasm component artifact envelope and OCI descriptor.
- Rebuilds produce the same component bytes and digest under `SOURCE_DATE_EPOCH`, sorted inputs, path remapping, and pinned toolchain fields.
- The Wasmtime-shaped smoke check invokes the `health` export and returns `hello-bindle:ok`.
- Adversarial guards fail closed on `Date.now()` source nondeterminism and jco version skew, and publish the pinned Ubuntu/Windows CI matrix tuple.

Scope note: this is a walking-skeleton contract proof. Real `componentize-js`/jco execution, `wasm-tools` CLI validation, Wasmtime execution, non-TS language paths, Dagger/container builds, and signing remain owned by downstream build/provider/signing slices.
