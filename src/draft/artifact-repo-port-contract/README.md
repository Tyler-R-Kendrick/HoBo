# hobo:artifact-repo Port Contract POC

This POC pins the M0 `hobo:artifact-repo@0.1.0` contract for HOBO-347.

It defines:

- `pull(coordinate) -> verified-artifact` with digest-pinned artifact references.
- `publish(artifact, provenance) -> ref` with required digest-pinned provenance.
- Registered adapter kinds for npm, NuGet, PyPI, OCI, Maven, Cargo, and RubyGems.
- A mirror-set abstraction that only contains registered adapters.
- A conformance stub asserting the digest-pinned pull and provenance-required publish invariants.

Scope intentionally stops before signature/provenance verification enforcement, digest-as-selection-key mirror selection, air-gap import/mirroring, concrete adapter implementations, and CLI behavior.

## Verification

Run the focused suite:

```bash
npm.cmd --prefix src\draft\artifact-repo-port-contract test
```

The root `npm.cmd test` also discovers this package's Node test suite.
