# HOBO-160 Collect CLI Proof

HOBO-160 is proven by the focused POC at
[`src/draft/hobo-collect-cli-contract`](../../../../src/draft/hobo-collect-cli-contract/README.md).

## Acceptance Evidence

- `collect prints hobo.manifest/v1 with inferred allow sets and stable JSON envelope`
  proves the sample app emits manifest IR with inferred `allow` sets and links.
- `--camp selects the camp in the stable read-only collect envelope` proves camp
  selection is surfaced without crossing into deployment/provider work.
- `--out writes the manifest IR to a stable file and keeps stdout as a status envelope`
  proves the file-output path.
- `coverage-incomplete collection is labeled and never presented as complete`
  proves unhit branch resources surface as coverage diagnostics instead of being
  silently omitted.
- repeated `--json` runs assert deterministic stdout for the same program.

## Adversarial Evidence

- `collection failure reports context and never emits a partial manifest` covers
  collection-time exceptions.
- `non-TypeScript guests get a static-analysis-required diagnostic` covers the
  non-TS static-analysis boundary.
- `secret values are redacted while secret refs remain inspectable` covers
  secret-ref display without leaking values.

## Scope Boundary

The package models the `hobo collect` CLI contract only. It consumes the existing
resource-collection and coverage POCs; it does not implement Matching, provider
resolution, `hobo up`, deployment writes, or non-TypeScript static analysis.

## Verification

```powershell
npm.cmd --prefix src\draft\hobo-collect-cli-contract test
```
