{ pkgs, lib, config, ... }:

# hobo-code declares its own environment with devenv so "works on my machine"
# is a checked claim rather than a hope. Every tool the harness shells out to
# is named here: node/pnpm to build, tmux for the multi-pane session model,
# git for mediated sandboxes, ollama for the local $0 inference path, and
# python for the Cactus Needle tool-call bridge.
#
# Cross-platform: Nix covers Linux and macOS; Windows runs it under WSL2.
{
  name = "hobo-code";

  packages = with pkgs; [
    git          # mediated sandboxes: worktree add/remove, promote diffs
    tmux         # herdr-style multi-pane agent sessions
    openssh      # remote panes are the same shape as local ones
    jq
  ] ++ lib.optionals pkgs.stdenv.isLinux [
    # Local inference is Linux/macOS; on other platforms hobo-code degrades
    # to dispatch-only rather than pretending.
    ollama
  ];

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    pnpm.enable = true;
  };

  # Cactus Needle (26M function-calling model) runs on JAX via its own venv.
  languages.python = {
    enable = true;
    version = "3.11";
    venv.enable = true;
  };

  env = {
    # Keep the harness on the local path by default inside the dev shell.
    HOBO_CODE_ENGINE = "auto";
    HOBO_CODE_NEEDLE_DIR = "${config.env.HOME}/.cactus/needle";
  };

  enterShell = ''
    echo "hobo-code devenv · node $(node --version) · tmux $(tmux -V | cut -d' ' -f2)"
  '';

  # `devenv test` — cheap checks that the declared env is actually usable.
  enterTest = ''
    node --version
    git --version
    tmux -V
  '';
}
