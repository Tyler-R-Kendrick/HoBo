-- hobo-code.nvim — managed pane bridge for CLI-native engineers.
-- Opens isolation roots / files and surfaces harness status without leaving neovim.
--
-- Install (lazy.nvim example):
--   { dir = "/path/to/packages/code/editor/hobo-code.nvim" }
-- Or: set runtimepath^=/path/to/packages/code/editor/hobo-code.nvim

local M = {}

local function hobo(args)
  local cmd = { "hobo-code" }
  for _, a in ipairs(args) do
    table.insert(cmd, a)
  end
  return vim.fn.system(cmd)
end

--- Open path (or cwd) via hobo-code edit --json bridge metadata, then edit.
function M.open(path)
  path = path or vim.fn.getcwd()
  local out = hobo({ "edit", "--json", path })
  -- Best-effort: if hobo-code missing, just edit path.
  if vim.v.shell_error ~= 0 then
    vim.cmd.edit(vim.fn.fnameescape(path))
    vim.notify("hobo-code edit failed; opened path directly", vim.log.levels.WARN)
    return
  end
  local ok, data = pcall(vim.json.decode, out)
  if ok and data and data.data and data.data.editor then
    local ed = data.data.editor
    local target = ed.targetPath or path
    vim.cmd.edit(vim.fn.fnameescape(target))
    if ed.isolationRootHint then
      vim.b.hobo_isolation_root = ed.isolationRootHint
    end
    vim.notify("hobo-code pane · " .. (ed.activeBridge or "direct"), vim.log.levels.INFO)
  else
    vim.cmd.edit(vim.fn.fnameescape(path))
  end
end

--- Show harness status in a scratch buffer (CLI-native glance).
function M.status()
  local out = hobo({ "status" })
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, vim.split(out, "\n", { plain = true }))
  vim.api.nvim_buf_set_option(buf, "filetype", "text")
  vim.api.nvim_buf_set_option(buf, "bufhidden", "wipe")
  vim.cmd("split")
  vim.api.nvim_win_set_buf(0, buf)
end

--- Open isolation tree if set, else cwd.
function M.isolation()
  local root = vim.b.hobo_isolation_root or vim.fn.getcwd()
  vim.cmd.edit(vim.fn.fnameescape(root))
end

function M.setup(opts)
  opts = opts or {}
  vim.api.nvim_create_user_command("HoboOpen", function(o)
    M.open(o.args ~= "" and o.args or nil)
  end, { nargs = "?", complete = "file" })
  vim.api.nvim_create_user_command("HoboStatus", function()
    M.status()
  end, {})
  vim.api.nvim_create_user_command("HoboIsolation", function()
    M.isolation()
  end, {})
  if opts.keymap ~= false then
    vim.keymap.set("n", "<leader>ho", function()
      M.open()
    end, { desc = "hobo-code open" })
    vim.keymap.set("n", "<leader>hs", M.status, { desc = "hobo-code status" })
  end
end

return M
