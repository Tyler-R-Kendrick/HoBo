# Agent tooling progressive setup

Feature id: `agent-tooling-setup`

## Seed

An agent operator configures coding agents for HoBo with a zero-key default path; MCP/skills docs match committed config; optional key tools fail closed with remediation.

## Personas

Generated one Gherkin file per persona (explicit --personas):

- `agent-tooling-setup-product-app-developer.feature` ← `.optimizexp/personas/product-app-developer.md`
- `agent-tooling-setup-product-agent-operator.feature` ← `.optimizexp/personas/product-agent-operator.md`
- `agent-tooling-setup-product-platform-engineer.feature` ← `.optimizexp/personas/product-platform-engineer.md`
- `agent-tooling-setup-product-coding-agent.feature` ← `.optimizexp/personas/product-coding-agent.md`

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/agent-tooling-setup.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id agent-tooling-setup`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`cli`
