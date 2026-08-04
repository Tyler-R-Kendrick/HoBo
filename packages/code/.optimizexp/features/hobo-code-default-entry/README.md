# Cold-start bare TTY hobo-code chat discoverability: `hobo-code`

Feature id: `hobo-code-default-entry`
Scope: `code` (`packages/code/.optimizexp`)

## Seed

Cold-start bare TTY hobo-code chat discoverability: `hobo-code`

## Personas

Generated one Gherkin file per persona (explicit --personas; config prefer/exclude (.optimizexp/config.json + packages/code/.optimizexp/config.json)):

- `hobo-code-default-entry-protocol-native-coding-agent.feature` ← `packages/code/.optimizexp/personas/protocol-native-coding-agent.md` (scope: code)

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/hobo-code-default-entry.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id hobo-code-default-entry`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`tui`
