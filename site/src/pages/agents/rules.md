---
layout: ../../layouts/Docs.astro
title: Rules & guardrails
description: "The non-negotiables for changes in the HoBo repo: architecture rules (PACT, protobuf, CUE, CQRS), the TypeScript-only policy, the command ladder, and testing lanes."
---

# Rules & guardrails

These rules are harness-neutral — they bind Claude Code, Cursor, Codex, Copilot CLI, and humans equally. They're enforced by fast local gates before CI ever runs. Canonical text: [`AGENTS.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/AGENTS.md).

## Architecture rules (the big five)

Every implementation change — including draft proof packages — must preserve:

1. **PACT at every service boundary.** A boundary isn't implemented until consumer/provider expectations, headers, payloads, and error envelopes are executable contract tests.
2. **Protobuf-first records.** Records, messages, and domain objects are defined in protobuf; runtime types are the **generated** ones. Hand-declaring a TS interface that duplicates a proto message is a violation; `pnpm run codegen:check` is the drift gate.
3. **CUE constraints beside every proto type.** Each package owns its local `data-models/` folder — no repository-wide catalog.
4. **Parse, don't validate.** Untrusted input crosses one parser boundary into refined derived types whose constructors apply the protobuf + CUE constraints; invalid values are unrepresentable beyond it.
5. **Event-driven CQRS.** Actors consume commands, emit events, coordinate durable state; queries are rx-style projections over materialized views with cached and persisted snapshots. Name the command/event families and replay expectations for new behavior.

The fail-fast check is `pnpm run architecture:guard` (staged variant in pre-commit). Package structure is additionally enforced by konsistent (`pnpm run konsistent`): every package pairs `package.json` + `tsconfig.json` with `src/`, `test/`, `contracts/`, `data-models/`.

## TypeScript-only policy

New JavaScript-family implementation files must be TypeScript: `.ts`/`.tsx`/`.mts` (`.cts` only when CommonJS semantics are required). No new `.js`/`.jsx`/`.mjs`/`.cjs`. Run repo scripts through `tsx`. Enforced by `pnpm run standards:check`.

## Parallel work rule

Only edit files directly related to the assigned task; prefer changes inside one package or feature folder. Avoid shared/global files (`package.json`, lockfiles, `turbo.json`, root tsconfigs, `.github/workflows/**`, `AGENTS.md`, generated files, shared fixtures) unless the task explicitly requires them. Never hand-edit generated files — regenerate with the owning codegen command.

## Performance-first command ladder

Never use tests for discovery. Climb this ladder and stop as early as possible:

```text
1. pnpm run search "<exact text>"
2. pnpm run search:structure --filter <rule>   (or ast-grep -p)
3. pnpm run test:smoke <file>
4. pnpm run test:file <file>
5. pnpm run test:name "<name>" <file>
6. HOBO_CHECK_BASE=origin/main pnpm run test:changed
7. pnpm run test:affected
8. HOBO_CHECK_BASE=origin/main pnpm run validate:local
9. pnpm run validate:final
```

Don't run broad `node --test` sweeps, category runners, or contract suites as diagnostics; don't retry a slow command after timeout. Broad root sweeps refuse to run in agent sessions unless `--final`/`--all` is passed explicitly.

## Testing lanes (no traditional E2E)

The repo does not use full-stack E2E tests — no lanes that require real downstream services. Browser-driven tests may use Playwright **only as a browser driver** against mocked boundaries derived from Pact contracts or schema fixtures.

| Lane | For |
|---|---|
| `pnpm test:unit` / `test:types` | Unit and type-level checks |
| `pnpm test:schema` | Protobuf/CUE/schema compatibility + generated-contract drift |
| `pnpm test:contract:consumer` / `:provider` | Pact-style consumer contracts; provider verification against mocks |
| `pnpm test:dom` / `test:component` | DOM state; real-browser components with mocked boundaries |
| `pnpm test:behavior` | Gherkin/Cucumber behavior specs with Pact-derived mocks |
| `pnpm test:visual` / `eval:agent:mock` | Deterministic visual regression; deterministic agent evals |

`pnpm agent:check` routes to the smallest relevant lane: no-arg validates the latest commit, `--staged` validates staged files, `--base=origin/main` validates the whole branch.

## Validation-failure policy

Failed validation is not an acceptable completion state. Fix the failing check in the same change, or stop and report the task as blocked — never commit or present work as complete with required checks failing.

## Docs move with code

Any change to code, automation, package metadata, CI, hooks, or agent tooling must update the matching documentation in the same change — `pnpm run docs:freshness` enforces the minimum. Before finishing a branch: rebase on `origin/main` and run `pnpm agent:check -- --base=origin/main`.
