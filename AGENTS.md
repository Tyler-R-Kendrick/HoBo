# Agent tooling for this repo

This repo is wired for **Claude Code**, **Cursor**, and **Codex** (plus **GitHub Copilot CLI** for Superpowers) with the installable agent tools listed in the [`docs/agent-tooling.md`](docs/agent-tooling.md) table plus repo-local `repo` and `draft` skills. Full reference + risks: [`docs/agent-tooling.md`](docs/agent-tooling.md). One-time binary install: [`scripts/setup-agent-tools.sh`](scripts/setup-agent-tools.sh). In devcontainers, start with the common layer before agent-specific shims.

| Tool | Type | What it does | Invoke |
|---|---|---|---|
| **improve** (`shadcn/improve`) | skill (read-only) | Audits the codebase and writes prioritized implementation **plans** to `docs/plans/` for other agents to execute. Never edits source. | `/improve`, `/improve quick`, `/improve security`, `/improve execute <plan>` |
| **superpowers** (`obra/Superpowers`) | plugin (skills library) | A development **methodology**: structured **brainstorming**, plan-writing, TDD, systematic debugging, subagent-driven dev, and code-review workflows. No keys. | `brainstorming`, `writing-plans`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, … (14 skills) |
| **mattpocock/skills** (`mattpocock/skills`) | skills collection | Engineering disciplines: **`grill-with-docs`** (relentless design interview that writes ADRs + glossary), `domain-modeling`, `codebase-design`, `diagnosing-bugs`, `tdd`, `to-prd`, `to-issues`, `prototype`, … No keys. | `/grill-with-docs`, `/ask-matt`, `/domain-modeling`, `/setup-matt-pocock-skills` (one-time config) |
| **caveman** (`JuliusBrussee/caveman`) | skill + rules | Compresses **agent output** (~65–87% fewer tokens) while keeping technical accuracy. | active by default (see below); `/caveman [lite\|full\|ultra\|wenyan]`, `/caveman-commit`, `/caveman-review`, `/caveman-stats` |
| **ponytail** (`DietrichGebert/ponytail`) | skill | Pushes the **minimalist solution** — YAGNI, stdlib/native before dependencies, one line before fifty; reviews/audits for over-engineering. No keys. | `/ponytail [lite\|full\|ultra]`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help` |
| **tgrep** (`microsoft/tgrep`) | CLI | Fast trigram-indexed exact/regex search for repo discovery before tests or semantic search. Local, no keys. | `pnpm run search <pattern>` |
| **ast-grep** (`ast-grep/ast-grep`) | CLI | AST structural search/rewrite for code-shape queries; repo-pinned through `@ast-grep/cli` plus `sgconfig.yml`. Local, no keys. | `pnpm run search:structure`, `pnpm exec ast-grep run -p <pattern> -l ts` |
| **Serena** (`oraios/serena`) | MCP server | IDE-like semantic code retrieval, symbol-aware editing/refactoring, and project memory through LSPs. Local-first, no keys. | MCP tools after `serena init`; shared launcher `scripts/agent-mcp-serena.sh` |
| **headroom** (`chopratejas/headroom`) | MCP server | Compresses **context fed to the model** (tool outputs, logs, files); reversible via `headroom_retrieve`. Local-first, no keys. | MCP tools `mcp__headroom__*`; optional proxy `headroom proxy` |
| **RTK** (`rtk-ai/rtk`) | CLI proxy/hooks | Rust Token Killer compresses noisy shell-command output before agents see it. Local, no keys. | installed by `scripts/setup-agent-tools.sh`; `rtk <cmd>`, `rtk gain` |
| **gbrain** (`garrytan/gbrain`) | MCP server | Knowledge-graph **memory**: capture notes, hybrid search + synthesis. | MCP tools after `gbrain init`; CLI `gbrain capture/search/query` |
| **SkillOpt** (`microsoft/SkillOpt`) | optimizer / research harness | Trains reusable markdown skills from scored rollouts and exports `best_skill.md` artifacts for multiple harnesses. Optional, not runtime config. | `skillopt-train`; `scripts/skillopt-sleep.sh status|dry-run|run|adopt`; installed from microsoft/SkillOpt |

How they fit together: **Serena** gives agents semantic code tools, **superpowers** + **mattpocock/skills** supply the *workflow & rigor* (brainstorm → grill-with-docs → plan → build/TDD → review), **improve** decides *what* to do, **ponytail** keeps the code itself minimal (YAGNI / stdlib-first), **headroom** + **RTK** + **caveman** keep token use down (context-in, shell-output, and agent-output — complementary), **gbrain** remembers across sessions, and **SkillOpt** is reserved for offline improvement of reusable skills when we have scored tasks.

## Repo-local repo skill

The repo-local **repo** skill lives in both `.agents/skills/repo` and `.claude/skills/repo`. Use it for repository lifecycle work: setup, cleanup, search, scoped implementation, validation, commits, PR handoff, deployment, and iteration. It encodes the performance-first loop:

```text
Search before validate.
Validate changed scope before package scope.
Validate package scope before repo scope.
Use fast approximate tools first.
Use exact/slow compatibility tools last.
```

The skill defaults to local hybrid retrieval: OKF `index.md` files, `tgrep` when available, `rg`, `fd`, `ast-grep`, `git grep`, and memory/semantic tools only after exact or structural search narrows the question. It does not use Google ingestion or querying products by default. It also repeats core repo rules: preserve user work, use `git mv` for tracked moves, avoid broad install/codegen/test commands as diagnostics, rebase on `origin/main`, run the narrowest relevant `agent:check` scope, and open or update an auto-merge squash PR only after checks and comments are clean. No-arg `agent:check` validates the latest commit against `HEAD~1`; use `agent:check -- --staged` before committing staged fixes and `agent:check -- --base=origin/main` only when intentionally validating the whole PR branch. `agent:check` must stay impact-scoped: direct draft workspace tests use `pnpm --prefix <workspace> test`, broad root unit/contract sweeps are explicit final/all validation, and concurrent checks are bounded by `HOBO_RELEVANT_CHECK_CONCURRENCY`.

## Repo-local sdlc skill + implementer/reviewer subagents

The repo-local **sdlc** skill (mirrored in `.agents/skills/sdlc` and `.claude/skills/sdlc`) coordinates full-loop feature development: brainstorm → adversarial/rubber-duck hardening → plan mode over the draft-proof cascade (technical → epic; experience proofs in parallel; projects aggregate) → Linear capture as one-shot issues (verifiable outputs + required draft artifacts named per issue) → **permission-gated** dispatch through a harness-detected backend matrix (see `references/dispatch.md`): cloud coding agents (GitHub coding agent via MCP/`gh agent-task`, Codex cloud, Cursor background) are preferred for isolated one-shot issues; local subagent worktrees handle shared-file-adjacent work; a sequential fallback keeps the loop alive when no delegation capability probes true. Every backend receives the same one-shot issue contract and returns the same handback schema — `.sdlc/report.json` in a worktree, or a fenced `sdlc-report` JSON block in the PR body for cloud dispatches. The Claude Code backend is two subagent definitions under `.claude/agents/`:

- **implementer** — one Linear issue, one isolated worktree, strict red/green TDD/BDD/ATDD (the acceptance checklist becomes the failing tests: unit, PACT contract, cucumber feature, bench). Zero Linear access; never edits shared files; hands back `.sdlc/report.json` with gates, cascade deltas, and requirement discoveries.
- **reviewer** — read-only; independently re-runs the gates and walks the acceptance checklist (cloud PRs get the same walk against a local checkout of the PR branch).

The coordinator owns ALL Linear state and shared-file mutations (single-writer), and an issue is Done only when GitHub reports the PR checks green **and** the independent review passes — never on an implementation agent's self-report. Durable loop state lives in `docs/plans/<initiative>/sdlc-state.md`; dispatch outcomes feed `docs/plans/dispatch-log.md`, which the next Linear-planning pass consults to improve issue contracts.

## Repo-local draft skill

The repo-local **draft** skill lives in both `.agents/skills/draft` and `.claude/skills/draft`. Use it when creating, moving, or reviewing draft proof material. It replaces the old one-level draft convention with the four-layer taxonomy:

- `src/draft/technical-proofs/<slug>` for isolated atomic technical concepts.
- `src/draft/exp-proofs/<type>/<slug>` for experience proofs, grouped by experience type (`dx` developer · `ux` user · `cx` customer · `ax` agent · `api` API/SDK surface) per [`src/draft/exp-proofs/_classification.md`](src/draft/exp-proofs/_classification.md).
- `src/draft/epic-proofs/<slug>` for isolated epic rollups that reuse technical and experience proofs.
- `src/draft/projects/<slug>` for project MVP rollups that integrate epic proofs.

Both repo-local skills keep Codex-valid `SKILL.md` frontmatter and store Open Knowledge Format concept metadata in their `references/` bundles. `pnpm.cmd run docs:okf` validates the docs OKF bundle plus the `repo` and `draft` skill reference bundles in both agent mirrors. `pnpm run skills:mirror-check` asserts the `.claude`/`.agents` skill mirrors stay byte-identical (runs automatically via `agent:check` when skill files change).

### Draft-proof hardening

Every proof layer has **folder-scoped `AGENTS.md` instructions** beside the packages (`src/draft/<kind>/AGENTS.md`, plus one per exp type folder) and scaffolding templates under `src/draft/_templates/<layer>/`. New/changed proofs are validated by two gates that run automatically through `agent:check`:

- `pnpm run draft:artifacts` — per-layer artifact requirements from a `proof.json` manifest (`scripts/lib/proof-manifest.ts`): gate-**executed** `examples/`, executed tslab `notebook.ipynb`, bench for technical proofs, executable cucumber `features/` for epics (`pnpm run test:behavior`), per-type experience artifacts for exp proofs. Waivers need an ADR.
- `pnpm run draft:cascade` — a changed technical/exp proof must update every referencing epic/project rollup in the same diff (references resolve from `proof.json` graphs + import/ledger scans).

Packages predating the standard are listed in `src/draft/_grandfathered.json` (advisory-only until their backfill wave removes them; never add new packages there).


## Parallel work rule

Only edit files directly related to the assigned task.

Prefer changes inside one package, app, feature folder, or test folder.

### Connectivity, naming, multi-tenant foundations

- Hierarchical DNS-valid names are pure functions in `@hobo/core` (`getNamedEndpoint`, `sanitizeDnsLabel`). Never emit bare `.hobo`; use `.hobo.localhost` (local) or `.hobo.test` (overlay). See [ADR-0130](docs/design/adr/07-portability-extensibility.md#adr-0130).
- Implementations for overlay (Tailscale/Netbird), pluggable DNS, tag/ACL `PolicyEngine`, metering sinks, and optional portless local named endpoints live in `@hobo/connectivity`.
- Local serve paths inject `namedEndpoints` / `primaryNamedUrl` when available; port-based behavior remains the default offline path when portless is absent (`HOBO_PORTLESS=0` forces off).
- Tenant context: `HOBO_TENANT` / `HOBO_PROJECT` / `HOBO_BRANCH` / `HOBO_ENV`. Soft multi-tenancy via IDs + PolicyEngine is the baseline; hard isolation is a later phase.

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

The generated-files pre-commit guard (`scripts/no-hand-edited-generated-files.mts`) accepts generated-output changes only when the same commit also touches their driving sources: protobuf/CUE schemas, WIT interfaces, or a recognized generator (schema-tools, `packages/wit` codegen + `wit-lock.json`). Regenerate with the owning codegen command (`pnpm run codegen`, `pnpm --filter @hobo/wit run wit:gen`) rather than editing outputs.

## Draft-proof promotion policy

When a draft proof under `src/draft/` is promoted into a production package, **the package copy becomes canonical and the proof is frozen** — record the promotion in [`scripts/promotions.json`](scripts/promotions.json) (`status: "frozen"`, digests pinned via `pnpm run promotions:check -- --update`). After that, all changes land in the package; `pnpm run promotions:check` (enforced by the root test suite) fails if a frozen proof is edited. Partial promotions that deliberately leave capability behind in the proof use `status: "reference"` with a note explaining the split. This exists because promoted copies previously diverged silently (see GAPS.md implementation-gap register, IMPL-005/IMPL-006).

Before finishing a whole PR branch:

```bash
git fetch origin
git rebase origin/main
pnpm agent:check -- --base=origin/main
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
scripts/check-package-boundaries.mts
scripts/install-hooks.mts
```

Invoke TypeScript repo scripts through `tsx`:

```bash
node --import tsx scripts/no-hand-edited-generated-files.mts
```

Do not add `.mjs` repo scripts. If a non-TypeScript JavaScript-family implementation file is unavoidable because of a tooling limitation, document the exception in an ADR before adding it. Sanctioned exceptions: committed platform entry files under `examples/*/deploy/` that the target platform ingests verbatim (ADR-0126).

Before finalizing changes that add, rename, or modify implementation files, scripts, generated-file guards, package config, TypeScript config, Turbo config, or CI config, run:

```bash
pnpm run standards:check -- --base=origin/main
```

If this check fails, fix the violation rather than bypassing it.

## HoBo implementation architecture rules

All HoBo implementation work, including `src/draft/<kind>/<slug>` proof packages, must preserve these architectural contracts:

- Enforce every service boundary with PACT contracts. A boundary is not implemented until consumer/provider expectations, headers, payloads, and error envelopes are executable.
- Define records, messages, data shapes, and domain objects in protobuf first. Runtime record types must be the **generated** ones: a package opts into codegen by adding `data-models/buf.yaml`, runs `pnpm run codegen` (`@hobo/schema-tools` → buf/protoc-gen-es), and imports its types from the checked-in `src/_generated/**_pb.ts` (reference consumer: `packages/core`). Hand-declaring a TS interface that duplicates a proto message is a violation; derived types must be brands/narrowings **of** the generated types. `pnpm run codegen:check` is the drift gate.
- Attach CUE constraints for every protobuf type and keep them with the protobuf contract or proof package. Do not create a repository-wide `contracts/data-models` catalog; each project/package that defines a CUE-constrained type owns its own local `data-models/` folder.
- Parse, don't validate: do not pass broad primitive or DTO values after checking them. Introduce derived parsed types whose constructors apply protobuf and CUE constraints so invalid values are unrepresentable beyond the boundary.
- Build flows on CQRS, event stores, materialized views, and actor models. Actors consume commands, emit events, and coordinate durable state; they do not mutate query read models directly.
- Keep query surfaces event-driven: expose rx-style projections over materialized views, use cached snapshots for current reads, and persist historical snapshots in a read store.
- For new behavior, name the command/event families, replay expectations, projection behavior, snapshot/read-store persistence, and the PACT/protobuf/CUE proof that pins the boundary.

Local and CI gates enforce this early with `pnpm run architecture:guard`. The canonical package layout these rules assume — each package pairing `package.json` and `tsconfig.json` with `src/`, `test/`, `contracts/`, and its own local `data-models/` folder — is additionally enforced structurally by [**konsistent**](https://www.npmjs.com/package/konsistent) (Vercel's structural linter for TypeScript codebases). The root [`konsistent.json`](konsistent.json) declares the `production-package-scaffolding` and `nested-package-scaffolding` conventions; run them with `pnpm run konsistent`. It is pinned as a dev dependency via pnpm, wired into `pnpm run check:all`, and selected by the narrow gate (`scripts/relevant-check-policy.ts`) whenever packages, automation, or `konsistent.json` itself change. The staged pre-commit path runs `pnpm run fetch:pr-base` before `pnpm agent:check -- --staged` so PR-targeted checks use the latest base branch available from `origin`/the configured remote, then only relevant architecture/test/doc lanes run before CI.


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

## Legal hygiene rules

These are cheap to honor and expensive to unwind. See
[`docs/plans/0009-legal-compliance-audit.md`](docs/plans/0009-legal-compliance-audit.md).

- **Licence metadata is enforced.** Every workspace manifest declares `"license": "MIT"`, and every publishable package (no `"private": true`) ships a `LICENSE` listed in its `files` array. `pnpm run licenses:check` gates this, and also rejects a production dependency whose licence is not on the allowlist in `scripts/check-licenses.ts`. Add a new licence there with a review note rather than working around the gate.
- **No third-party logos.** Naming a vendor is nominative fair use; reproducing its logo or brand mark is not. Do not add third-party logos or brand assets to the site, docs, or README without explicit review. Word marks in prose are fine.
- **Never imply endorsement.** Nothing in docs, site copy, or marketing may state or suggest that HoBo is affiliated with, endorsed by, sponsored by, or certified by any provider.
- **Third-party facts carry a source and a date.** Prices, free tiers, and vendor terms transcribed into this repo are *ranking input, never billing input*. Tag them with the source URL and the date a human checked them (`COST_SOURCE`, `PROVIDER_TERMS`); never fabricate an attestation field like `signedAt` that implies the vendor signed something.
- **Provider-terms invariants ([ADR-0129](docs/design/adr/07-portability-extensibility.md#adr-0129)).** Registered providers are the operator's own accounts. Never pool, share, or resell free-tier headroom across tenants; never create provider accounts or rotate identities to reset a free tier. Rotation is *across providers*, never *across accounts within a provider*.
- **No unsupported compliance claims.** SOC 2, ISO 27001, GDPR, HIPAA, PCI, and similar certifications stay unclaimed until an owning evidence surface accepts them.

## Keys & risks (read before enabling gbrain)
- **gbrain needs an embedding key** (`OPENAI_API_KEY` *or* `ZEROENTROPY_API_KEY` *or* `VOYAGE_API_KEY`) and **sends the text it embeds + your queries to that provider** — recurring cost + data egress. It is **inert until you run `gbrain init` and set a key**. Don't point it at sensitive content you don't want leaving your machine. Configure via `.env` (see `.env.example`).
- **Serena / headroom / RTK / improve / caveman / ponytail / superpowers** need **no keys** and run locally; superpowers has optional telemetry (set `SUPERPOWERS_DISABLE_TELEMETRY=1` to disable).
- **SkillOpt** is installed from `microsoft/SkillOpt`; its default sleep mock backend is no-spend, but real `codex`, `claude`, OpenAI, Azure OpenAI, Qwen, or MiniMax backends use the credentials/budget you configure.
- **caveman** was installed via a `curl … | bash` shim (forwarding to `npx github:JuliusBrussee/caveman`); the pinned installer is handled in `scripts/setup-agent-tools.sh`.
- Committing `.mcp.json` / `.cursor/mcp.json` means opening this repo in Claude Code or Cursor will prompt to launch the `serena`, `headroom`, and `gbrain` MCP servers. Decline if you don't want them.

## MCP wiring (per agent)
- **Claude Code** — `.mcp.json` (auto-discovered) defines `serena` + `headroom` + `gbrain`.
- **Cursor** — `.cursor/mcp.json` (same three servers).
- **Codex** — copy `.codex/config.toml`'s `[mcp_servers.*]` into `~/.codex/config.toml`, or run `codex mcp add …` (see the setup script). Codex reads MCP config globally, not per-project.

Progressive setup: run `bash scripts/setup-agent-tools.sh --common-only --no-gbrain` first (this is also the devcontainer default), then run `bash scripts/setup-agent-tools.sh --agent claude-code|cursor|codex|copilot --no-gbrain` only for the client you actually use. Shared MCP launchers should live in `scripts/` first (for example `scripts/agent-mcp-serena.sh`) and then be referenced by `.mcp.json`, `.cursor/mcp.json`, and `.codex/config.toml`. When one agent-specific config changes, update the other supported configs in the same commit or document why it does not apply. Skills (`repo`, `draft`, `improve`, `caveman`, `ponytail`) live in `.claude/skills/` (Claude Code) and `.agents/skills/` (Cursor + Codex). ponytail is invocation-based here (`/ponytail …`), not always-on — run `/ponytail` to activate it for a session (it can be made always-on via `/plugin install ponytail@ponytail` in Claude Code if you want that).

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

## Performance-first command policy

Never use tests for discovery. Search first.

Use this ladder:

1. `pnpm run search "<exact text>"`
2. `pnpm run search:structure --filter <rule>` or `pnpm exec ast-grep run -p "<pattern>" -l ts`
3. `pnpm run test:smoke <single test file>`
4. `pnpm run test:file <single test file>`
5. `pnpm run test:name "<test name>" <single test file>`
6. `HOBO_CHECK_BASE=origin/main pnpm run test:changed`
7. `pnpm run test:affected`
8. `HOBO_CHECK_BASE=origin/main pnpm run validate:local`
9. `pnpm run validate:final`

Rules:

- Do not run `node --test` during implementation.
- Do not run `scripts/run-tests.ts --category=*` during implementation.
- Do not run `--test-concurrency=1` with more than one file.
- Do not run broad globs like `test/*.test.ts`.
- Do not run provider and consumer contract suites as diagnostics.
- Do not retry the same slow command after timeout.
- Do not run coverage, artifact generation, or full contract suites unless doing final validation.
- Prefer Bun for smoke tests when compatible.
- Prefer Vitest for normal local validation.
- Prefer Node only for final compatibility validation.

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

Run the smallest sufficient lane through `pnpm agent:check`; no-arg mode validates the latest commit, `--staged` validates staged files, and `--base=origin/main` validates the whole PR branch. It never selects E2E, avoids broad unit/contract sweeps unless final/all validation explicitly asks for them, and escalates only to schema, contract, UI, behavior, visual, or mock-agent eval lanes based on changed files.

## Cursor Cloud specific instructions

Durable, non-obvious notes for this environment. The startup update script already runs `corepack enable pnpm` + `pnpm install --frozen-lockfile`, so dependencies are ready; do not re-add install steps here.

- **No server/GUI.** This is a design-docs + executable proof/contract repo (see README "Current state"). "Running the app" means the validation/lint/test tooling, not a web/backend service. Verify the environment with `pnpm run doctor`, `pnpm run lint`, `pnpm run standards:check`, `pnpm test`, and the doc validators listed in `README.md` "How to work in this repo".
- **Node version.** Local Node 22 satisfies `engines` (`>=20.20.0`); CI uses Node 24. The `pnpm install` warnings about `wizer-win32-x64` bins are expected on Linux (Windows-arch optional deps) and are harmless.
- **Developer inner loop for a single proof package:** `pnpm exec turbo run test --filter ./src/draft/<kind>/<slug>` (see `src/draft/AGENTS.md`). The turbo "no output files found" warning on `test` is expected (no build outputs) and not a failure.
- **`test:smoke` runs Vitest** (`vitest run --no-isolate`), same engine as `test:file`; there is no bun dependency.
- **`tgrep` is not installed**, so `pnpm run search` falls back to `rg`. Always pass explicit path args (e.g. `pnpm run search "pattern" src docs`); running it with no path scope over the full worktree can be very slow.
- **All local gates pass clean on `main`** (`lint`, `standards:check`, `architecture:guard`, `docs:okf`, `docs:cli-lint`, `docs:design-lint`, `docs:coverage`, `docs:freshness`, SDK/deployment validators); treat any failure as caused by the change under test, not the environment.
