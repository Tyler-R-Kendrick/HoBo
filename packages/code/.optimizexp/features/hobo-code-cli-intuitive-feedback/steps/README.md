# Steps & tests — `hobo-code-cli-intuitive-feedback`

| Path | Role |
|---|---|
| `world.ts` | Shared Cucumber/world state |
| `bindings.steps.ts` | Given/When/Then → implementations |
| `implementations.ts` | Real or stub logic (discovery-wired when possible) |
| `discovery.json` | Code discovery report |
| `../test/hobo-code-cli-intuitive-feedback.bindings.test.ts` | Vitest smoke for bindings |

## Primary binding

- **package-script** `pnpm run prepare-hooks` (medium)
- script "prepare-hooks" matched seed keywords (score 5)

## Run

```bash
# unit/smoke (vitest)
pnpm run test:file .optimizexp/features/hobo-code-cli-intuitive-feedback/test/hobo-code-cli-intuitive-feedback.bindings.test.ts

# cucumber (optimizexp profile, if configured)
pnpm run test:behavior:optimizexp -- --name "hobo-code-cli-intuitive-feedback"
# or:
node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js \
  --config .optimizexp/cucumber.yaml \
  --name "hobo-code-cli-intuitive-feedback"
```

## Agent rules

1. Prefer wiring steps to **existing** package scripts / CLIs found in `discovery.json`.
2. If code does not exist, leave `IMPLEMENTATION_STATUS` as `stub` and record a finding (friction/uncertainty).
3. Do not call live external services from default steps.
4. Re-run discovery: `generate-feature.mts --mode implement --id hobo-code-cli-intuitive-feedback`.
