# GHCP parity: animated title, enterprise auth, BYOK open models, built-in sandbox

Feature id: `hobo-code-ghcp-parity`
Scope: `code` (`packages/code/.optimizexp`)

## Seed

GHCP parity: animated title, enterprise auth, BYOK open models, built-in sandbox for advanced Copilot CLI users

## Personas

Generated one Gherkin file per persona (explicit --personas; config prefer/exclude (.optimizexp/config.json + packages/code/.optimizexp/config.json)):

- `hobo-code-ghcp-parity-github-copilot-cli-advanced-user.feature` ← `packages/code/.optimizexp/personas/github-copilot-cli-advanced-user.md` (scope: code)

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/hobo-code-ghcp-parity.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id hobo-code-ghcp-parity`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`cli`
