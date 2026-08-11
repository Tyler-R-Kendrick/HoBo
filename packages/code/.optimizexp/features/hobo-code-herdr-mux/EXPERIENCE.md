# EXPERIENCE: hobo-code-herdr-mux

- entryCommand: `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts session --help`
- driver: cli
- intent: Discover and operate resident tmux-backed agent sessions without tribal knowledge

## Rubber-duck (explain to a new teammate)

1. Who is the persona and what are they trying to finish in the next 2 minutes?
   - A Herdr power user checking whether hobo-code offers real resident sessions, not a decorative status box.
2. What exact command / UI path do they take from a clean machine?
   - `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts session --help`
3. What do they see first? (quote expected chrome, not vibes)
   - Resident session verbs for create/list, tabs, panes, agents, checkpoints, delivery, detach/reattach, and browser control.
4. What would make them think they opened the wrong product?
   - Wrong binary, empty help, or monorepo gate noise unrelated to the journey.
5. Happy path: step-by-step (Given/When/Then in prose first).
   - Given a clean workspace, when session help opens, then every resident-control path and persistence boundary is explicit.
6. Failure path: how do they break it, what must the product say?
   - Bad args or missing deps → non-zero exit + remediation, not stack-only.
7. What evidence will prove a human/agent actually ran this? (driver + command)
   - CLI before/after captures plus real tmux, restart, and browser acceptance checks.
8. What is deliberately out of scope for this feature folder?
   - Full production E2E against live third-party services.

## Adversarial critique (must check all)

- [x] Did not skip default entry because a secondary verb is easier to automate
- [x] Not testing a monorepo script instead of the product binary
- [x] No When-step is only “exercise the surface” without a real command
- [x] Scores cannot be invented without reading stdout/TUI
- [x] Persona vocabulary/asserts considered for shared paths
- [x] Security: secrets, destructive promote, network—fail-closed
- [x] Cognitive load: journey stays within persona thresholds
- [x] Confusion twin: stock UI / wrong binary / wrong verb—covered
- [x] If this feature were the only one we ship, the persona would not still be lost

## Verdict

- accept
- primaryCommand: `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts session --help`
- driver: cli
- scenarios: happy, failure, discoverability
