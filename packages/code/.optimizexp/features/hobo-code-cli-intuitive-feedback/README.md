# hobo-code commands and feedback are intuitive: clear usage, honest success/fail,

Feature id: `hobo-code-cli-intuitive-feedback`
Scope: `code` (`packages/code/.optimizexp`)

## Seed

hobo-code commands and feedback are intuitive: clear usage, honest success/fail, next steps

## Personas

Generated one Gherkin file per persona (explicit --personas; config prefer/exclude (.optimizexp/config.json + packages/code/.optimizexp/config.json)):

- `hobo-code-cli-intuitive-feedback-advanced-nix-devenv-developer.feature` ← `packages/code/.optimizexp/personas/advanced-nix-devenv-developer.md` (scope: code)
- `hobo-code-cli-intuitive-feedback-developer.feature` ← `.optimizexp/personas/developer.md` (scope: global)

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/hobo-code-cli-intuitive-feedback.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id hobo-code-cli-intuitive-feedback`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`cli`
