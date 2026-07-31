# hobo-code subcommand --help is topic-scoped: platform --help documents platform 

Feature id: `hobo-code-subcommand-help`
Scope: `code` (`packages/code/.optimizexp`)

## Seed

hobo-code subcommand --help is topic-scoped: platform --help documents platform only

## Personas

Generated one Gherkin file per persona (explicit --personas; config prefer/exclude (.optimizexp/config.json + packages/code/.optimizexp/config.json)):

- `hobo-code-subcommand-help-developer.feature` ← `packages/code/.optimizexp/personas/developer.md` (scope: code)
- `hobo-code-subcommand-help-advanced-nix-devenv-developer.feature` ← `packages/code/.optimizexp/personas/advanced-nix-devenv-developer.md` (scope: code)

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/hobo-code-subcommand-help.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id hobo-code-subcommand-help`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`cli`
