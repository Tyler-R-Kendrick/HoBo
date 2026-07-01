# HOBO-4 Componentize Proof

HOBO-4 is proven by the focused POC at [`src/draft/technical-proofs/hobo-componentize-contract`](../../../../src/draft/technical-proofs/hobo-componentize-contract/README.md).

S0-07 draft implementation (real `componentize-js` + `jco` toolchain) lives at [`src/draft/technical-proofs/hobo-componentize`](../../../../src/draft/technical-proofs/hobo-componentize/README.md) pending promotion to `packages/componentize/` now that S0-06 (`@hobo/wit`) has merged. HOBO-603 spike evidence is at [`src/draft/technical-proofs/componentize-js-determinism-spike`](../../../../src/draft/technical-proofs/componentize-js-determinism-spike/README.md).

**S1-23 integration (HOBO-613):** `@hobo/cli` build adapter consumes this contract via
[`src/draft/projects/s1-23-hobo-build`](../../../../src/draft/projects/s1-23-hobo-build/README.md);
golden digest `sha256:3810bde887b5e8d763dca98e0f6c725e0c5d72d54cdac600d8cb7443b9c282d7`.

Acceptance mapping:

- `hello-bindle` builds into a deterministic wasm component artifact envelope and OCI descriptor.
- Rebuilds produce stable `inputsDigest` and smoke output under `SOURCE_DATE_EPOCH`, sorted inputs, path remapping, and pinned toolchain fields. **Byte-identical wasm** from `componentize-js@0.21.0` is **not** asserted at S0 — see [ADR-0105](../../adr/01-architecture-core.md#adr-0105) and the [HOBO-603 spike](../../../../src/draft/technical-proofs/componentize-js-determinism-spike/README.md).
- The Wasmtime-shaped smoke check invokes the `health` export and returns `hello-bindle:ok`.
- Adversarial guards fail closed on `Date.now()` source nondeterminism and jco version skew, and publish the pinned Ubuntu/Windows CI matrix tuple.

Scope note: this is a walking-skeleton contract proof. Real `componentize-js`/jco execution, `wasm-tools` CLI validation, Wasmtime execution, non-TS language paths, Dagger/container builds, and signing remain owned by downstream build/provider/signing slices.

**Promotion (S0-11 / HOBO-588):** the production seed fixture now lives at [`examples/hello-bindle`](../../../../examples/hello-bindle/README.md). `@hobo/componentize` on `packages/componentize/` supplies the consumed build API.
