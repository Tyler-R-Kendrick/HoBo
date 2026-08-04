# hobo-code config inventories env/flags by preferred tech stack so each persona c

Feature id: `hobo-code-config-setup`
Scope: `code` (`packages/code/.optimizexp`)

## Seed

hobo-code config inventories env/flags by preferred tech stack so each persona can audit setup without grepping source; --stack filters; secrets presence-only; soft gaps for missing model/editor/mon knobs

## Personas

Generated one Gherkin file per persona (explicit --personas; config prefer/exclude (.optimizexp/config.json + packages/code/.optimizexp/config.json); truncated to maxPersonas=4):

- `hobo-code-config-setup-advanced-cli-native-vim-engineer.feature` ← `packages/code/.optimizexp/personas/advanced-cli-native-vim-engineer.md` (scope: code)
- `hobo-code-config-setup-ai-automation-engineer-pi-flue.feature` ← `packages/code/.optimizexp/personas/ai-automation-engineer-pi-flue.md` (scope: code)
- `hobo-code-config-setup-cost-conscious-open-source-dev.feature` ← `packages/code/.optimizexp/personas/cost-conscious-open-source-dev.md` (scope: code)
- `hobo-code-config-setup-senior-dev-tmux-mosh-tailscale.feature` ← `packages/code/.optimizexp/personas/senior-dev-tmux-mosh-tailscale.md` (scope: code)

## Bindings & tests

| Path | Role |
|---|---|
| `steps/bindings.steps.ts` | Cucumber Given/When/Then |
| `steps/implementations.ts` | Real command when discovered, else stub |
| `steps/discovery.json` | Code discovery report |
| `test/hobo-code-config-setup.bindings.test.ts` | Vitest smoke |

Re-discover / rewire: `generate-feature.mts --mode implement --id hobo-code-config-setup`

## Evidence

`evidence/<scenario-slug>/` — one primary recording per scenario; re-runs overwrite.

## Driver

`cli`
