# Steps & tests — `hobo-code-subcommand-help`

| Path | Role |
|---|---|
| `world.ts` | Shared Cucumber/world state |
| `bindings.steps.ts` | Given/When/Then → implementations |
| `implementations.ts` | Real or stub logic (discovery-wired when possible) |
| `discovery.json` | Code discovery report |
| `../test/hobo-code-subcommand-help.bindings.test.ts` | Vitest smoke for bindings |

## Primary binding

- None — implementations are stubs until a command/path is discovered or filled by the agent.

## Run

```bash
# unit/smoke (vitest)
pnpm run test:file .optimizexp/features/hobo-code-subcommand-help/test/hobo-code-subcommand-help.bindings.test.ts

# cucumber (optimizexp profile, if configured)
pnpm run test:behavior:optimizexp -- --name "hobo-code-subcommand-help"
# or:
node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js \
  --config .optimizexp/cucumber.yaml \
  --name "hobo-code-subcommand-help"
```

## Agent rules

1. Prefer wiring steps to **existing** package scripts / CLIs found in `discovery.json`.
2. If code does not exist, leave `IMPLEMENTATION_STATUS` as `stub` and record a finding (friction/uncertainty).
3. Do not call live external services from default steps.
4. Re-run discovery: `generate-feature.mts --mode implement --id hobo-code-subcommand-help`.
