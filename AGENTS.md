# Agent tooling for this repo

This repo is wired for **Claude Code**, **Cursor**, and **Codex** (plus **GitHub Copilot CLI** for Superpowers) with nine installable agent tools. Full reference + risks: [`docs/agent-tooling.md`](docs/agent-tooling.md). One-time binary install: [`scripts/setup-agent-tools.sh`](scripts/setup-agent-tools.sh). In devcontainers, start with the common layer before agent-specific shims.

| Tool | Type | What it does | Invoke |
|---|---|---|---|
| **improve** (`shadcn/improve`) | skill (read-only) | Audits the codebase and writes prioritized implementation **plans** to `docs/plans/` for other agents to execute. Never edits source. | `/improve`, `/improve quick`, `/improve security`, `/improve execute <plan>` |
| **superpowers** (`obra/Superpowers`) | plugin (skills library) | A development **methodology**: structured **brainstorming**, plan-writing, TDD, systematic debugging, subagent-driven dev, and code-review workflows. No keys. | `brainstorming`, `writing-plans`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, … (14 skills) |
| **mattpocock/skills** (`mattpocock/skills`) | skills collection | Engineering disciplines: **`grill-with-docs`** (relentless design interview that writes ADRs + glossary), `domain-modeling`, `codebase-design`, `diagnosing-bugs`, `tdd`, `to-prd`, `to-issues`, `prototype`, … No keys. | `/grill-with-docs`, `/ask-matt`, `/domain-modeling`, `/setup-matt-pocock-skills` (one-time config) |
| **caveman** (`JuliusBrussee/caveman`) | skill + rules | Compresses **agent output** (~65–87% fewer tokens) while keeping technical accuracy. | active by default (see below); `/caveman [lite\|full\|ultra\|wenyan]`, `/caveman-commit`, `/caveman-review`, `/caveman-stats` |
| **ponytail** (`DietrichGebert/ponytail`) | skill | Pushes the **minimalist solution** — YAGNI, stdlib/native before dependencies, one line before fifty; reviews/audits for over-engineering. No keys. | `/ponytail [lite\|full\|ultra]`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help` |
| **Serena** (`oraios/serena`) | MCP server | IDE-like semantic code retrieval, symbol-aware editing/refactoring, and project memory through LSPs. Local-first, no keys. | MCP tools after `serena init`; shared launcher `scripts/agent-mcp-serena.sh` |
| **headroom** (`chopratejas/headroom`) | MCP server | Compresses **context fed to the model** (tool outputs, logs, files); reversible via `headroom_retrieve`. Local-first, no keys. | MCP tools `mcp__headroom__*`; optional proxy `headroom proxy` |
| **gbrain** (`garrytan/gbrain`) | MCP server | Knowledge-graph **memory**: capture notes, hybrid search + synthesis. | MCP tools after `gbrain init`; CLI `gbrain capture/search/query` |
| **SkillOpt** (`microsoft/SkillOpt`) | optimizer / research harness | Trains reusable markdown skills from scored rollouts and exports `best_skill.md` artifacts for multiple harnesses. Optional, not runtime config. | `skillopt-train`; `scripts/skillopt-sleep.sh status|dry-run|run|adopt`; installed from microsoft/SkillOpt |

How they fit together: **Serena** gives agents semantic code tools, **superpowers** + **mattpocock/skills** supply the *workflow & rigor* (brainstorm → grill-with-docs → plan → build/TDD → review), **improve** decides *what* to do, **ponytail** keeps the code itself minimal (YAGNI / stdlib-first), **headroom** + **caveman** keep token use down (context-in vs output-out — complementary), **gbrain** remembers across sessions, and **SkillOpt** is reserved for offline improvement of reusable skills when we have scored tasks.


## Parallel work rule

Only edit files directly related to the assigned task.

Prefer changes inside one package, app, feature folder, or test folder.

Avoid shared/global files unless the task explicitly requires them:

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `turbo.json`
- root `tsconfig*.json`
- `.github/workflows/**`
- `AGENTS.md`
- generated files
- shared fixtures
- central registry/barrel files

Do not hand-edit generated files. Avoid manual barrel-file edits; prefer direct imports or generated barrels. Split shared fixtures into scenario/domain-local files when a task needs fixture changes. Change `package.json` or lockfiles only for dependency-related tasks.

Before finishing:

```bash
git fetch origin
git rebase origin/main
pnpm agent:check
```

If there are conflicts, resolve them before finalizing.

## Technical standards for code and contracts

These rules are harness-neutral and apply to Claude Code, Cursor, Codex, Copilot CLI, and any other agent editing this repo:

- Prefer compile-time feedback over runtime error discovery. Treat typecheck, generated-contract, CUE, conformance, and PACT failures as design feedback, not cleanup.
- Use the latest stable TypeScript toolchain for new JavaScript-family implementation, executable contract, and proof code. Do not add new vanilla JavaScript modules when TypeScript can provide static feedback; migrate touched legacy JS opportunistically.
- Use Protobuf for data contracts at integration and persistence boundaries. Keep WIT, Protobuf, TypeScript, runtime guard, and documentation views generated from one source family or explicitly reconciled in proof fixtures.
- Use CUE for invariants and dependent constraints: ranges, formats, cross-field relationships, state transitions, capability predicates, policy obligations, and compatibility rules.
- Implement "Parse, don't validate": untrusted input crosses one parser boundary and becomes a refined/derivative object definition. Core functions should accept parsed/refined domain types, not raw DTOs plus repeated boolean checks.
- Require PACT-style consumer-driven contract tests for every integration boundary: SDK/runtime, runtime/provider, CLI/API, event/projection, generated plugin/host, and external service edges.
- When changing code, automation, package metadata, CI, hooks, or agent tooling, update docs/proof notes to identify the TypeScript, Protobuf, CUE, and PACT gates that protect the change, or document the tracked gap.

Canonical detail lives in [`docs/design/technical-standards.md`](docs/design/technical-standards.md).


## JavaScript-family implementation file policy

This repo requires new JavaScript-family implementation files to be TypeScript-family files.

Do not create new implementation files with these extensions:

- `.js`
- `.jsx`
- `.mjs`
- `.cjs`

Use one of these instead:

- `.ts` for normal TypeScript source
- `.tsx` for React/JSX TypeScript source
- `.mts` for TypeScript ESM files that should behave like `.mjs`
- `.cts` only when CommonJS semantics are explicitly required

Prefer `.ts` unless the file needs explicit ESM behavior independent of the nearest `package.json` `"type"` field. For ESM repo scripts that would previously have been written as `.mjs`, use `.mts`.

Examples:

```txt
scripts/no-hand-edited-generated-files.mts
scripts/check-targeted.mts
scripts/agent-standards-hook.mts
```

Invoke TypeScript repo scripts through `tsx`:

```bash
node --import tsx scripts/no-hand-edited-generated-files.mts
```

Do not add `.mjs` repo scripts. If a non-TypeScript JavaScript-family implementation file is unavoidable because of a tooling limitation, document the exception in an ADR before adding it.

Before finalizing changes that add, rename, or modify implementation files, scripts, generated-file guards, package config, TypeScript config, Turbo config, or CI config, run:

```bash
pnpm run standards:check -- --base=origin/main
```

If this check fails, fix the violation rather than bypassing it.

## HoBo implementation architecture rules

All HoBo implementation work, including `src/draft/*` proof packages, must preserve these architectural contracts:

- Enforce every service boundary with PACT contracts. A boundary is not implemented until consumer/provider expectations, headers, payloads, and error envelopes are executable.
- Define records, messages, data shapes, and domain objects in protobuf first. Generated or handwritten runtime types must derive from those protobuf definitions instead of inventing parallel interfaces.
- Attach CUE constraints for every protobuf type and keep them with the protobuf contract or proof package.
- Parse, don't validate: do not pass broad primitive or DTO values after checking them. Introduce derived parsed types whose constructors apply protobuf and CUE constraints so invalid values are unrepresentable beyond the boundary.
- Build flows on CQRS, event stores, materialized views, and actor models. Actors consume commands, emit events, and coordinate durable state; they do not mutate query read models directly.
- Keep query surfaces event-driven: expose rx-style projections over materialized views, use cached snapshots for current reads, and persist historical snapshots in a read store.
- For new behavior, name the command/event families, replay expectations, projection behavior, snapshot/read-store persistence, and the PACT/protobuf/CUE proof that pins the boundary.

Local and CI gates enforce this early with `pnpm run architecture:guard`. The staged pre-commit path runs `pnpm run fetch:pr-base` before `pnpm agent:check -- --staged` so PR-targeted checks use the latest base branch available from `origin`/the configured remote, then only relevant architecture/test/doc lanes run before CI.


## Validation failure policy

Failed validation is not an acceptable completion state. If a check fails, either fix the failing code/configuration in the same change or clearly stop and report that the task is blocked; do not commit or present the work as complete while required checks are failing.

Use the staged targeted path for pre-commit-sized work:

```bash
pnpm agent:check -- --staged
```

Use broader build-impacting checks only when intentionally validating a branch/root tooling change, not as a default staged hook substitute.

## Documentation maintenance rule

Whenever a change touches code, automation, package metadata, CI, hooks, or agent tooling, update the matching documentation in the same change. At minimum, check whether `README.md`, `docs/design/index.md`, `docs/agent-tooling.md`, and the relevant proof/contract README still describe the current state. If no user-facing docs change is needed, add or update the closest maintenance note so reviewers can see that docs were considered.

Local and CI gates enforce this with `pnpm run docs:freshness`: code changes under `src/`, `scripts/`, `test/`, package metadata, workflows, or agent config must be accompanied by a docs change. The repo hook in `.githooks/pre-commit` runs `pnpm run check:relevant:staged`, which routes to the smallest relevant architecture, test, docs, traceability, and contract lanes; enable it with `pnpm run prepare-hooks`.

## Keys & risks (read before enabling gbrain)
- **gbrain needs an embedding key** (`OPENAI_API_KEY` *or* `ZEROENTROPY_API_KEY` *or* `VOYAGE_API_KEY`) and **sends the text it embeds + your queries to that provider** — recurring cost + data egress. It is **inert until you run `gbrain init` and set a key**. Don't point it at sensitive content you don't want leaving your machine. Configure via `.env` (see `.env.example`).
- **Serena / headroom / improve / caveman / ponytail / superpowers** need **no keys** and run locally; superpowers has optional telemetry (set `SUPERPOWERS_DISABLE_TELEMETRY=1` to disable).
- **SkillOpt** is installed from `microsoft/SkillOpt`; its default sleep mock backend is no-spend, but real `codex`, `claude`, OpenAI, Azure OpenAI, Qwen, or MiniMax backends use the credentials/budget you configure.
- **caveman** was installed via a `curl … | bash` shim (forwarding to `npx github:JuliusBrussee/caveman`); the pinned installer is handled in `scripts/setup-agent-tools.sh`.
- Committing `.mcp.json` / `.cursor/mcp.json` means opening this repo in Claude Code or Cursor will prompt to launch the `serena`, `headroom`, and `gbrain` MCP servers. Decline if you don't want them.

## MCP wiring (per agent)
- **Claude Code** — `.mcp.json` (auto-discovered) defines `serena` + `headroom` + `gbrain`.
- **Cursor** — `.cursor/mcp.json` (same three servers).
- **Codex** — copy `.codex/config.toml`'s `[mcp_servers.*]` into `~/.codex/config.toml`, or run `codex mcp add …` (see the setup script). Codex reads MCP config globally, not per-project.

Progressive setup: run `bash scripts/setup-agent-tools.sh --common-only --no-gbrain` first (this is also the devcontainer default), then run `bash scripts/setup-agent-tools.sh --agent claude-code|cursor|codex|copilot --no-gbrain` only for the client you actually use. Shared MCP launchers should live in `scripts/` first (for example `scripts/agent-mcp-serena.sh`) and then be referenced by `.mcp.json`, `.cursor/mcp.json`, and `.codex/config.toml`. When one agent-specific config changes, update the other supported configs in the same commit or document why it does not apply. Skills (`improve`, `caveman`, `ponytail`) live in `.claude/skills/` (Claude Code) and `.agents/skills/` (Cursor + Codex). ponytail is invocation-based here (`/ponytail …`), not always-on — run `/ponytail` to activate it for a session (it can be made always-on via `/plugin install ponytail@ponytail` in Claude Code if you want that).

## Superpowers plugin (Claude Code · Codex · Copilot)
`superpowers` is a **plugin** (not a skills-dir install), from the `obra/superpowers-marketplace`. It's wired repo-portably for **Claude Code** via [`.claude/settings.json`](.claude/settings.json) (`extraKnownMarketplaces` + `enabledPlugins`), so it auto-enables when you open the repo. For **Codex** and **GitHub Copilot CLI**, install per-machine (the setup script runs these if those CLIs are present):
```
# Claude Code (also: handled by .claude/settings.json):
claude plugin marketplace add obra/superpowers-marketplace && claude plugin install superpowers@superpowers-marketplace
# Codex CLI:
codex plugin marketplace add obra/superpowers-marketplace && codex plugin install superpowers@superpowers-marketplace
# GitHub Copilot CLI:
copilot plugin marketplace add obra/superpowers-marketplace && copilot plugin install superpowers@superpowers-marketplace
```
Skills load at **session start** (a SessionStart hook), so enable it, then start a fresh session to use `brainstorming`, `writing-plans`, `requesting-code-review`, etc.

<!-- caveman:begin — terse-output directive. Caveman mode is INSTALLED and ON by default.
     To disable: delete `.cursor/rules/caveman.mdc`, remove this block, and run
     `npx -y github:JuliusBrussee/caveman -- --uninstall`. -->
## Caveman mode (active)
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan. Stop: "stop caveman" or "normal mode".
Auto-Clarity: drop caveman for security warnings, irreversible actions, or a confused user. Resume after.
Boundaries: code/commits/PRs written normal.
<!-- caveman:end -->

## Testing policy

This repo does not use traditional E2E tests. Do not add `test:e2e`, `e2e/`, or Playwright tests that require real downstream services.

Allowed browser-driven tests must use mocked service boundaries derived from Pact contracts, protobuf/CUE schema fixtures, or shared contract fixtures. Playwright may be used only as a browser driver, not as a full-stack E2E framework.

Use these lanes instead:

- `pnpm test:unit` for unit tests.
- `pnpm test:types` for type-level checks.
- `pnpm test:schema` for protobuf/CUE/schema compatibility and generated contract checks.
- `pnpm test:contract:consumer` for consumer Pact-style contracts.
- `pnpm test:contract:provider` for provider verification against mocked dependencies.
- `pnpm test:dom` for DOM/rendered state tests.
- `pnpm test:component` for real-browser component behavior with mocked service boundaries.
- `pnpm test:behavior` for Gherkin/Cucumber or Playwright-driven behavior specs with Pact-derived mocks.
- `pnpm test:visual` for deterministic visual state regression.
- `pnpm eval:agent:mock` for deterministic agent evals.

Live service checks and `pnpm eval:agent:live` are manual/release-only lanes. Default PR and agent checks must not require live external services.

Run the smallest sufficient lane through `pnpm agent:check`; it never selects E2E and escalates only to schema, contract, UI, behavior, visual, or mock-agent eval lanes based on changed files.
