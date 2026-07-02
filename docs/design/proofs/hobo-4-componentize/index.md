# HOBO-4 Componentize Proof

HOBO-4 is proven by the focused POC at [`src/draft/technical-proofs/hobo-componentize-contract`](../../../../src/draft/technical-proofs/hobo-componentize-contract/README.md).

The executable S0-07 draft POC is tracked on HOBO-584 (PR #660). HOBO-603 spike evidence is at [`src/draft/technical-proofs/componentize-js-determinism-spike`](../../../../src/draft/technical-proofs/componentize-js-determinism-spike/README.md).

Acceptance mapping:

- `hello-bindle` builds into a deterministic wasm component artifact envelope and OCI descriptor.
- Rebuilds produce stable `inputsDigest` and smoke output under `SOURCE_DATE_EPOCH`, sorted inputs, path remapping, and pinned toolchain fields. **Byte-identical wasm** from `componentize-js@0.21.0` is **not** asserted at S0 — see [ADR-0105](../../adr/01-architecture-core.md#adr-0105) and the [HOBO-603 spike](../../../../src/draft/technical-proofs/componentize-js-determinism-spike/README.md).
- The Wasmtime-shaped smoke check invokes the `health` export and returns `hello-bindle:ok`.
- Adversarial guards fail closed on `Date.now()` source nondeterminism and jco version skew, and publish the pinned Ubuntu/Windows CI matrix tuple.

Scope note: this is a walking-skeleton contract proof. Real `componentize-js`/jco execution, `wasm-tools` CLI validation, Wasmtime execution, non-TS language paths, Dagger/container builds, and signing remain owned by downstream build/provider/signing slices.

**Promotion (S0-11 / HOBO-588):** the production seed fixture now lives at [`examples/hello-bindle`](../../../../examples/hello-bindle/README.md). `@hobo/componentize` on `packages/componentize/` supplies the consumed build API.
