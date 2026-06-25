# HoBo WASI Interface Pins POC

This draft pins the HOBO-15 contract as a small executable surface:

- `wit/vendor/*.wit` records the vendored WASI interface slices HoBo reuses.
- `src/wasi-pins.mjs` verifies every vendored file against its recorded SHA-256 digest.
- `roundTripFixture()` simulates link encode -> provider export -> decode identity for keyvalue,
  blobstore, messaging, config, and logging shapes.
- `buildManifestFragment()` records each `interface@version@stability` in a manifest fragment.

The POC does not implement real providers, a component host, or full WIT parsing. Those belong to
the component-host and provider conformance suites. This package pins the branch-proveable contract
that drift is detectable before those later suites depend on these interfaces.

Run:

```powershell
node --test src\draft\wasi-interface-pins\test\wasi-pins.test.mjs
```
