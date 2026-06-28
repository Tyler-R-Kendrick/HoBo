# HOBO-160 collect CLI contract

This POC proves the read-only `hobo collect` wrapper around the existing
resource-collection engine.

- `createHoboCollectCli(...)` runs collection and prints the generated
  `hobo.manifest/v1` IR.
- `--camp <name>` carries the selected camp in the read-only collect envelope.
- `--json` emits a stable machine-readable envelope.
- `--out <file>` writes the manifest IR without changing the collection result.
- coverage gaps are labeled `coverage-incomplete`, never presented as complete.
- collection failures and non-TypeScript guest gaps fail closed without emitting
  partial manifests.
- secret configuration values are redacted; only refs are surfaced.

Scope stays CLI-wrapper only. This does not implement the collection engine,
coverage gate, Matching/provider resolution, deployment writes, or non-TypeScript
static analysis.
