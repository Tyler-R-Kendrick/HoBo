# Narrow local validation after a small change

Feature id: `narrow-local-validation`

## Seed

After a one-package or staged edit in HoBo, the developer runs a narrow validation command (`pnpm run agent:check -- --staged`) and gets a clear gate list or fix-forward error without a full monorepo ritual.

## Personas

Generated one Gherkin file per persona (explicit --personas):

- `narrow-local-validation-product-app-developer.feature` ← `.optimizexp/personas/product-app-developer.md`
- `narrow-local-validation-product-agent-operator.feature` ← `.optimizexp/personas/product-agent-operator.md`
- `narrow-local-validation-product-platform-engineer.feature` ← `.optimizexp/personas/product-platform-engineer.md`
- `narrow-local-validation-product-coding-agent.feature` ← `.optimizexp/personas/product-coding-agent.md`
- `narrow-local-validation-role-developers.feature` ← `.optimizexp/personas/role-developers.md`
- `narrow-local-validation-role-devsecops.feature` ← `.optimizexp/personas/role-devsecops.md`
- `narrow-local-validation-role-finops.feature` ← `.optimizexp/personas/role-finops.md`
- `narrow-local-validation-role-platform-engineers.feature` ← `.optimizexp/personas/role-platform-engineers.md`
- `narrow-local-validation-role-sre.feature` ← `.optimizexp/personas/role-sre.md`

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/narrow-local-validation.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id narrow-local-validation`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`cli`
