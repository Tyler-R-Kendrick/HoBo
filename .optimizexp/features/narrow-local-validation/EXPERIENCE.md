# EXPERIENCE: narrow-local-validation

- entryCommand: `pnpm run agent:check -- --staged`
- driver: cli
- intent: Exercise product path `pnpm run agent:check -- --staged` with evidence-backed persona review

## Rubber-duck (explain to a new teammate)

1. Who is the persona and what are they trying to finish in the next 2 minutes?
   - Stakeholder completing critical path via `pnpm run agent:check -- --staged` without tribal knowledge.
2. What exact command / UI path do they take from a clean machine?
   - `pnpm run agent:check -- --staged`
3. What do they see first? (quote expected chrome, not vibes)
   - Command stdout/stderr with status, usage, or structured result (not a silent hang).
4. What would make them think they opened the wrong product?
   - Wrong binary, empty help, or monorepo gate noise unrelated to the journey.
5. Happy path: step-by-step (Given/When/Then in prose first).
   - Given clean workspace When I run `pnpm run agent:check -- --staged` Then I see clear status and next action.
6. Failure path: how do they break it, what must the product say?
   - Bad args or missing deps → non-zero exit + remediation, not stack-only.
7. What evidence will prove a human/agent actually ran this? (driver + command)
   - driver: cli; capture-evidence with command `pnpm run agent:check -- --staged`
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
- primaryCommand: `pnpm run agent:check -- --staged`
- driver: cli
- scenarios: happy, failure, discoverability
