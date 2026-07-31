# CLI help and doctor path

Feature id: `cli-help-and-doctor`

## Seed

A developer or agent runs the HoBo CLI help/doctor (or equivalent) and gets actionable status without live cloud credentials.

## Personas

Generated one Gherkin file per persona (explicit --personas):

- `cli-help-and-doctor-product-app-developer.feature` ← `.optimizexp/personas/product-app-developer.md`
- `cli-help-and-doctor-product-agent-operator.feature` ← `.optimizexp/personas/product-agent-operator.md`
- `cli-help-and-doctor-product-platform-engineer.feature` ← `.optimizexp/personas/product-platform-engineer.md`
- `cli-help-and-doctor-product-coding-agent.feature` ← `.optimizexp/personas/product-coding-agent.md`
- `cli-help-and-doctor-role-developers.feature` ← `.optimizexp/personas/role-developers.md`
- `cli-help-and-doctor-role-devsecops.feature` ← `.optimizexp/personas/role-devsecops.md`
- `cli-help-and-doctor-role-finops.feature` ← `.optimizexp/personas/role-finops.md`
- `cli-help-and-doctor-role-platform-engineers.feature` ← `.optimizexp/personas/role-platform-engineers.md`
- `cli-help-and-doctor-role-sre.feature` ← `.optimizexp/personas/role-sre.md`

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/cli-help-and-doctor.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id cli-help-and-doctor`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`cli`
