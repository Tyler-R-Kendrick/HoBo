# hobo-code agent inventories human-free auth, unattended no-elicitation safe iter

Feature id: `hobo-code-agent-native`
Scope: `code` (`packages/code/.optimizexp`)

## Seed

hobo-code agent inventories human-free auth, unattended no-elicitation safe iterate, self-improve lessons, and native MCP/ACP protocols for coding agents

## Personas

Generated one Gherkin file per persona (explicit --personas; config prefer/exclude (.optimizexp/config.json + packages/code/.optimizexp/config.json)):

- `hobo-code-agent-native-protocol-native-coding-agent.feature` ← `packages/code/.optimizexp/personas/protocol-native-coding-agent.md` (scope: code)

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/hobo-code-agent-native.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id hobo-code-agent-native`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`cli`
