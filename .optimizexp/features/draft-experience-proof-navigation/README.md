# Draft experience proofs are navigable

Feature id: `draft-experience-proof-navigation`

## Seed

A platform engineer or agent locates experience proofs under src/draft/exp-proofs/ for HoBo and understands classification (ux/dx/ax/…) without guessing.

## Personas

Generated one Gherkin file per persona (explicit --personas):

- `draft-experience-proof-navigation-product-app-developer.feature` ← `.optimizexp/personas/product-app-developer.md`
- `draft-experience-proof-navigation-product-agent-operator.feature` ← `.optimizexp/personas/product-agent-operator.md`
- `draft-experience-proof-navigation-product-platform-engineer.feature` ← `.optimizexp/personas/product-platform-engineer.md`
- `draft-experience-proof-navigation-product-coding-agent.feature` ← `.optimizexp/personas/product-coding-agent.md`
- `draft-experience-proof-navigation-role-developers.feature` ← `.optimizexp/personas/role-developers.md`
- `draft-experience-proof-navigation-role-devsecops.feature` ← `.optimizexp/personas/role-devsecops.md`
- `draft-experience-proof-navigation-role-finops.feature` ← `.optimizexp/personas/role-finops.md`
- `draft-experience-proof-navigation-role-platform-engineers.feature` ← `.optimizexp/personas/role-platform-engineers.md`
- `draft-experience-proof-navigation-role-sre.feature` ← `.optimizexp/personas/role-sre.md`

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/draft-experience-proof-navigation.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id draft-experience-proof-navigation`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`cli`
