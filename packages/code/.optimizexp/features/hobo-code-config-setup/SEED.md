# Seed — hobo-code-config-setup

Personas must critique **configuration/setup** for their preferred tech stacks, not only runtime verbs.

## Journey

1. `hobo-code config` — multi-stack ●/○ inventory + setup tips + soft gaps
2. `hobo-code config --stack <id>` — filter (cost-budget, editor-vim, hermetic-nix, harness-pi-flue, remote-attach, …)
3. `hobo-code config --json` — full knobs; API keys presence-only never values
4. Unknown stack fails with actionable stack list

## Persona stacks

| Persona | Stack focus |
|---|---|
| cost-conscious-open-source-dev | cost-budget, models-byok, monetization |
| advanced-cli-native-vim-engineer | editor-vim |
| ai-automation-engineer-pi-flue | harness-pi-flue |
| senior-dev-tmux-mosh-tailscale | remote-attach, core |
| advanced-nix-devenv-developer | hermetic-nix (persona file; config default multi-stack) |

## Success

Setup is auditable without grepping source; secrets never printed; next action always filter/json/help.
