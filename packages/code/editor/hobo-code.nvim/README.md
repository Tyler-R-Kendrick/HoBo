# hobo-code.nvim

Minimal **Neovim** bridge so [neo]vim feels like a **managed harness pane**, not a detached `$EDITOR`.

## Install

```lua
-- lazy.nvim
{
  dir = vim.fn.getcwd() .. "/packages/code/editor/hobo-code.nvim", -- or absolute path
  config = function()
    require("hobo-code").setup()
  end,
}
```

Or:

```vim
set runtimepath^=/path/to/packages/code/editor/hobo-code.nvim
lua require("hobo-code").setup()
```

## Commands

| Command | Action |
|---|---|
| `:HoboOpen [path]` | Open path via `hobo-code edit --json` bridge metadata |
| `:HoboStatus` | Split with `hobo-code status` chrome |
| `:HoboIsolation` | Jump to isolation root buffer (if set) |

Default maps (disable with `setup{ keymap = false }`):

- `<leader>ho` — open
- `<leader>hs` — status

## CLI side

```bash
hobo-code edit src/cli.ts              # prefer nvim; tmux split when available
hobo-code edit --editor nvim --bridge tmux-send
hobo-code edit --json path             # bridge contract for plugins
hobo-code isolate my-run && hobo-code edit --isolation my-run
```

## Bridge modes

| Mode | Role |
|---|---|
| `tmux-send` | Managed split pane (default when `tmux` on PATH) |
| `direct-exec` | Replace TTY with editor |
| `stdio-jsonrpc` | Plugin ↔ CLI JSON (open/status) |
| `acp` | ACP-shaped (partial) |

Keyboard-first; no VS Code required.
