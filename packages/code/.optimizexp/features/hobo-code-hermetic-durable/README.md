# hobo-code hermetic + durable isolation

Feature id: `hobo-code-hermetic-durable`
Scope: `code` (`packages/code/.optimizexp`)

## Seed

hobo-code hermetic shell detection and durable sandbox separation for advanced nix devenv developers

## Personas

Generated one Gherkin file per persona (explicit --personas; config prefer/exclude (.optimizexp/config.json + packages/code/.optimizexp/config.json)):

- `hobo-code-hermetic-durable-advanced-nix-devenv-developer.feature` ← `packages/code/.optimizexp/personas/advanced-nix-devenv-developer.md` (scope: code)

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/hobo-code-hermetic-durable.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id hobo-code-hermetic-durable`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`cli`
