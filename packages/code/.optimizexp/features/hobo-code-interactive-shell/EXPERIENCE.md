# EXPERIENCE: hobo-code-interactive-shell

- experienceId: interactive-product-shell
- personaIds: sota-frontier-ai-native-tui-designer, claude-code-advanced-app-builder, new-gen-ai-native-grok-build-user, advanced-nix-devenv-developer
- entryCommand: `hobo-code` (TTY InteractiveShell)
- driver: tui
- intent: Bare interactive path is HoBo InteractiveShell with Bo — never stock Pi chrome

## Rubber-duck (explain to a new teammate)

1. Who — TUI designer + Claude Code builder + Grok Build user + Nix/devenv developer opening bare hobo-code on a real TTY after `pnpm --filter @hobo/code build`.
2. Path — installed `hobo-code` / `bin/hobo-code.mjs` → dist InteractiveShell (not `tsx src` only; not Pi unless `--pi`).
3. First see — HoBo logo + Bo, line “not stock Pi”, chat welcome, `❯` prompt, slash/Tab hints.
4. Wrong product — stock Pi Agent welcome, empty chrome, only one-shot verb walls, mouseInteractive JSON lies.
5. Happy — `/` palette lists guide/config/cost/tasks; Tab shows tasks/status; type prompt → Bo product path.
6. Failure — calm product messages; warning budget; no deceptive success stars on bad verbs outside shell.
7. Evidence — pure shell frame capture + stamped harness capture of help/status + scripted shell identity; unit hard-fail tests.
8. Out of scope — full Grok mouse parity film; streaming frontier model polish (Phase 2 residual).

## Adversarial critique (must check all)

- [x] Did not skip default entry because a secondary verb is easier to automate
- [x] Not testing a monorepo script instead of the product binary
- [x] No When-step is only “exercise the surface” without a real command or shell render
- [x] Scores cannot be invented without reading stdout/TUI frame
- [x] Persona vocabulary/asserts considered for shared paths
- [x] Security: secrets, destructive promote, network—fail-closed
- [x] Cognitive load: journey stays within persona thresholds
- [x] Confusion twin: stock Pi / wrong binary / stale dist—covered
- [x] If this feature were the only one we ship, the persona would not still be lost in Pi chrome

## Verdict

- accept
- primaryCommand: `hobo-code`
- driver: tui
- scenarios: identity frame, slash palette, tab tasks/status, not Pi
