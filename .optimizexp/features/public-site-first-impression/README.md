# Public site first impression

Feature id: `public-site-first-impression`

## Seed

A visitor lands on the HoBo public site and can understand what the product is, navigate primary docs, and leave with a clear next step within two minutes.

## Personas

Generated one Gherkin file per persona (explicit --personas):

- `public-site-first-impression-product-end-user.feature` ← `.optimizexp/personas/product-end-user.md`
- `public-site-first-impression-product-designer.feature` ← `.optimizexp/personas/product-designer.md`
- `public-site-first-impression-role-finops.feature` ← `.optimizexp/personas/role-finops.md`
- `public-site-first-impression-role-platform-engineers.feature` ← `.optimizexp/personas/role-platform-engineers.md`
- `public-site-first-impression-role-sre.feature` ← `.optimizexp/personas/role-sre.md`

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/public-site-first-impression.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id public-site-first-impression`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`web`
