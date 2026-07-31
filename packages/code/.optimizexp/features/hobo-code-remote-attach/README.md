# Feature: hobo-code-remote-attach

Dev-terminal attach for remote-terminal power users (tmux / mosh / Tailscale).

| Surface | Expect |
|---|---|
| `hobo-code attach` | Named host + reattach + local/overlay legend |
| `attach --json` | `registration`, `attach.steps`, `compare.{tmux,cmux,mosh,tailscale}` |
| `attach --mode overlay` | `registration.mode === overlay` |
| Help | tmux / mosh / Tailscale vocabulary |

Persona: `senior-dev-tmux-mosh-tailscale`.
