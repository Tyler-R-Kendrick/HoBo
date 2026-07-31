# Staged agent check is narrow and actionable after a skill edit

Feature id: `agent-check-staged`

## Seed

Staged agent check is narrow and actionable after a skill edit

## Personas

Generated one Gherkin file per persona (explicit --personas):

- `agent-check-staged-junior-typescript-developer.feature` ← `.optimizexp/personas/junior-typescript-developer.md`

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/agent-check-staged.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id agent-check-staged`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`cli`
