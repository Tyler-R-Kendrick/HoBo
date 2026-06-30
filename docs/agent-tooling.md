---
type: Agent Tooling Reference
title: "Agent tooling"
description: "Seven third-party AI-coding tools are wired into this repo for **Claude Code**, **Cursor**, and **Codex** (Superpowers also targets **GitHub Copilot CLI**). This page is the refere"
tags: [hobo, agent-tooling.md]
---

# Agent tooling

Nine third-party AI-coding tools are wired into this repo for **Claude Code**, **Cursor**, and **Codex** (Superpowers also targets **GitHub Copilot CLI**). This page is the reference; the at-a-glance table + always-on caveman directive live in [`../AGENTS.md`](../AGENTS.md). Install the binaries with [`../scripts/setup-agent-tools.sh`](../scripts/setup-agent-tools.sh).

> **Note:** this is *tooling* config, not part of the HoBo product design (`docs/design/`). It was added on request to make the agents productive in this repo.

## Product implementation guardrails

Agents implementing HoBo code must follow the canonical architecture rules in [`../AGENTS.md`](../AGENTS.md): every service boundary is pinned by PACT contracts; records, messages, data shapes, and objects are defined in protobuf with CUE constraints; runtime code parses into derived types instead of validating broad values in place; and flows use CQRS, event stores, materialized views, and actors. Actors consume commands, emit events, and coordinate durable state. Query paths use rx-style projections with cached current snapshots and persisted historical snapshots in a read store.

The fail-fast check is `pnpm run architecture:guard` (`pnpm run architecture:guard:staged` in pre-commit). It scans changed `src/draft/*` implementation packages for PACT, protobuf, CUE, parse-don't-validate, and event-architecture evidence before the slower test and CI gates run.

The full local test gate is `npm test`, backed by [`../scripts/run-tests.ts`](../scripts/run-tests.ts). It discovers tracked `*test.ts` and `*test.mjs` files, batches ordinary contract tests conservatively for speed, and isolates compile-heavy TypeScript consumer tests that are known to report grouped Node test-file wrapper failures on Windows even when their assertions pass individually. Keep those isolated entries unless the full pre-commit gate proves a grouped runner is stable; update the isolated list when adding contract tests that shell out to `tsc` or compile TypeScript consumers.

## The nine tools

### improve — `shadcn/improve` (MIT)
A **read-only agent skill**: surveys the codebase and writes prioritized, self-contained implementation **plans** to `docs/plans/` for other (cheaper) agents to execute. It never edits source. Commands: `/improve`, `/improve quick`, `/improve deep`, `/improve security|perf|tests|bugs`, `/improve branch`, `/improve next`, `/improve plan <desc>`, `/improve execute <plan>`, `/improve reconcile`. No API keys. Installed to `.claude/skills/improve` (Claude Code) and `.agents/skills/improve` (Cursor + Codex).

### superpowers — `obra/Superpowers` (MIT)
A **plugin** (skills library + methodology), v6.0.3, from the `obra/superpowers-marketplace`. Adds a structured development workflow — **brainstorming** (design refinement via questions), **writing-plans**, **test-driven-development**, **systematic-debugging**, **subagent-driven-development**, **requesting/receiving-code-review**, **using-git-worktrees**, **verification-before-completion**, **dispatching-parallel-agents**, **finishing-a-development-branch**, `using-superpowers`, `writing-skills` (14 skills total). **No API keys** (optional `SUPERPOWERS_DISABLE_TELEMETRY=1`). A `SessionStart` hook loads the skills, so **enable, then start a fresh session**.
- **Install (per agent):** Claude Code is wired repo-portably via [`../.claude/settings.json`](../.claude/settings.json) (`extraKnownMarketplaces` + `enabledPlugins`) — opening the repo auto-enables it. Codex / Copilot install per-machine: `<agent> plugin marketplace add obra/superpowers-marketplace && <agent> plugin install superpowers@superpowers-marketplace` (the setup script runs these when those CLIs are present). Unlike the skills tools, this is a **global plugin**, not committed skill files.

### mattpocock/skills — `mattpocock/skills` (MIT)
A **skills collection** of engineering disciplines, installed via the `skills` CLI to `.claude/skills/` (Claude Code) and `.agents/skills/` (Cursor + Codex). Highlights: **`grill-with-docs`** ("a relentless interview to sharpen a plan or design, which also creates docs — ADRs and glossary — as we go"), `domain-modeling`, `codebase-design`, `design-an-interface`, `diagnosing-bugs`, `tdd`, `to-prd`, `to-issues`, `request-refactor-plan`, `prototype`, plus model-invoked `grilling`. **No API keys.**
- **Configure (one-time):** run `/setup-matt-pocock-skills` in your agent to set up its issue-tracker / triage-label vocabulary / domain-doc layout (optional for a docs repo; skip if you don't use the issue-tracking skills).
- Used in this repo to **close competitor gaps** — see [`docs/competitors/gap-analysis.md`](./competitors/gap-analysis.md) and the resulting design work.

### caveman — `JuliusBrussee/caveman` (MIT)
A **skill + always-on rule** that compresses the agent's **output** (~65–87% fewer tokens) while preserving technical accuracy. Commands: `/caveman [lite|full|ultra|wenyan]`, `/caveman-commit`, `/caveman-review`, `/caveman-compress <file>`, `/caveman-stats`. No API keys. Installed to `.agents/skills/caveman*` (+ `cavecrew`), `.cursor/rules/caveman.mdc` (`alwaysApply: true`), a `## Caveman mode (active)` block in `AGENTS.md`, and (for Claude Code) a global `claude` plugin. Optional env `CAVEMAN_STATUSLINE_SAVINGS=0`.
- **It is ON by default.** To disable: delete `.cursor/rules/caveman.mdc`, remove the `<!-- caveman:begin … end -->` block from `AGENTS.md`, and run `npx -y github:JuliusBrussee/caveman -- --uninstall`.

### ponytail — `DietrichGebert/ponytail` (MIT)
A **minimalist-coding skill**: channels a senior dev who pushes the laziest solution that works — YAGNI (does this need to exist?), standard library before custom code, native platform features before dependencies, one line before fifty. Commands: `/ponytail [lite|full|ultra]`, `/ponytail-review` (review a diff for over-engineering), `/ponytail-audit` (whole-repo bloat scan), `/ponytail-debt` (harvest `ponytail:` shortcut comments into a ledger), `/ponytail-gain`, `/ponytail-help`. **No API keys; no third-party data transmission.** Installed (6 skills) to `.claude/skills/ponytail*` (Claude Code) and `.agents/skills/ponytail*` (Cursor + Codex).
- **Invocation-based here, not always-on.** Run `/ponytail` to activate it for a session. (Upstream also supports an always-on plugin install via `/plugin marketplace add DietrichGebert/ponytail` → `/plugin install ponytail@ponytail` in Claude Code; we use the skills route to keep it opt-in and committable, and to avoid stacking a second always-on directive on top of caveman.) Optional global config: `~/.config/ponytail/config.json` or `PONYTAIL_DEFAULT_MODE`.


### Serena — `oraios/serena` (MIT)
A **semantic-code MCP server**: it gives coding agents IDE-like symbol search, reference lookup, and safer symbol-aware edits/refactors through language servers. It is agent/harness agnostic because it speaks MCP; this repo exposes one shared launcher, [`../scripts/agent-mcp-serena.sh`](../scripts/agent-mcp-serena.sh), and points Claude Code, Cursor, and Codex at that wrapper instead of duplicating hard-coded commands. Install with `uv tool install -p 3.13 serena-agent`, then run `serena init`. No API keys. Serena may install/use language-server dependencies for the languages in the checkout.

### headroom — `chopratejas/headroom` (Apache-2.0)
A **token-compression MCP server** (also a CLI/proxy) that shrinks the **context fed to the model** — tool outputs, logs, file dumps — reversibly (`headroom_retrieve` fetches originals). Local-first, **no API keys**. MCP tools surface as `mcp__headroom__headroom_compress|retrieve|stats`. Launch: `headroom mcp serve` (wired in `.mcp.json` / `.cursor/mcp.json` / `.codex/config.toml`). For automatic compression of *all* traffic you can also run the proxy: `headroom proxy --port 8787` then `ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude` (optional; see `headroom mcp --help`).

### gbrain — `garrytan/gbrain` (MIT)
A **knowledge-graph memory MCP server** (+ CLI) on the **Bun** runtime: `gbrain capture` ingests notes, `gbrain search`/`query` does hybrid retrieval + synthesis. Launch: `gbrain serve` (stdio MCP). **Requires `gbrain init` once and an embedding key.**
- ⚠️ **Keys + data egress + cost:** set exactly one of `OPENAI_API_KEY` / `ZEROENTROPY_API_KEY` / `VOYAGE_API_KEY` (in `.env`). gbrain **sends the text it embeds and your queries to that provider** — recurring API cost and data leaving your machine. It is **inert until initialized with a key**; don't point it at content you don't want shared. The local store (PGLite) is gitignored.


### SkillOpt — `microsoft/SkillOpt` (MIT)
A **skill optimization research harness**, not a runtime MCP server. SkillOpt treats a markdown skill as trainable external state for a frozen agent: it runs scored rollouts, proposes bounded add/delete/replace edits, accepts only validation-improving candidates, and exports a compact `best_skill.md`. It currently targets direct chat plus Codex CLI and Claude Code CLI harnesses. Use it offline when the repo has scored tasks or benchmark suites worth optimizing against; do not put it in always-on agent instructions. The setup script installs it directly from `git+https://github.com/microsoft/SkillOpt.git`, verifies `skillopt-train` and `skillopt-sleep`, and exposes [`../scripts/skillopt-sleep.sh`](../scripts/skillopt-sleep.sh) as the repo-local runner. Use the default mock backend for no-spend dry runs, then opt in to `--backend codex` or `--backend claude` when you want real replay on your own budget.

## Progressive setup

Start with the common layer, then add one supported agent shim only when you need it:

```bash
bash scripts/setup-agent-tools.sh --common-only --no-gbrain
# later, choose one supported client:
bash scripts/setup-agent-tools.sh --agent claude-code --no-gbrain
bash scripts/setup-agent-tools.sh --agent cursor --no-gbrain
bash scripts/setup-agent-tools.sh --agent codex --no-gbrain
bash scripts/setup-agent-tools.sh --agent copilot --no-gbrain
```

The common layer installs agent-agnostic runtimes (`serena`, `headroom`, `skillopt-train`, `skillopt-sleep`) and leaves per-agent plugin/skill registration alone. Agent-specific layers only install shims for the selected supported client. Devcontainers run the common layer by default through [`.devcontainer/post-create.sh`](../.devcontainer/post-create.sh), avoiding prompts, global CLI mutations, and key-requiring gbrain setup during container creation.

## Per-agent wiring
| | MCP servers (Serena, headroom, gbrain) | Skills (improve, mattpocock, caveman, ponytail) | Plugin / optimizer |
|---|---|---|---|
| **Claude Code** | `.mcp.json` (auto-discovered) | `.claude/skills/` (incl. mattpocock) | `.claude/settings.json` for Superpowers; SkillOpt can run offline |
| **Cursor** | `.cursor/mcp.json` | `.agents/skills/` + `.cursor/rules/` (caveman) | — (no plugin support) |
| **Codex** | `~/.codex/config.toml` (copy from `.codex/config.toml`, or `codex mcp add …`) | `.agents/skills/` + `AGENTS.md` | `codex plugin marketplace add/install` (per-machine); SkillOpt can run offline |
| **GitHub Copilot CLI** | — | — | `copilot plugin marketplace add/install` (per-machine) |

Committed so a clone is wired up: `.mcp.json`, `.cursor/`, `.codex/config.toml`, `.claude/skills/`, `.agents/skills/`, shared MCP wrapper scripts, `AGENTS.md`, `CLAUDE.md`, `skills-lock.json`. Opening the repo in Claude Code/Cursor will prompt to start the `serena` + `headroom` + `gbrain` MCP servers — decline if unwanted.

## Install
```bash
bash scripts/setup-agent-tools.sh --common-only --no-gbrain # common/devcontainer-safe layer
bash scripts/setup-agent-tools.sh --agent codex --no-gbrain # add one supported agent shim
bash scripts/setup-agent-tools.sh              # common + all supported shims
bash scripts/setup-agent-tools.sh --no-skillopt # skip microsoft/SkillOpt install
```
Requires: Node ≥18 (`npx`), Python ≥3.10 (`pip`) for headroom/SkillOpt, `uv` (or Python to install `uv`) for Serena, and Bun for gbrain. Put `$HOME/.local/bin` (headroom, Serena fallback, SkillOpt CLIs) and `$HOME/.bun/bin` (gbrain) on your `PATH`.

## Trust / provenance
- All nine are MIT/Apache-2.0 OSS. `improve`, `mattpocock/skills`, `ponytail`, `superpowers`, `Serena`, and `headroom` are local with no egress (superpowers has optional, disable-able telemetry). `caveman` installs via a `curl|bash` shim that forwards to `npx github:JuliusBrussee/caveman`. `gbrain` is the only always-configured MCP tool with third-party data egress + cost; SkillOpt may call whatever model/backend you configure for offline training or sleep runs; its default sleep `mock` backend is no-spend and deterministic.
- `npx skills add … --copy` writes real files (not symlinks) so they're committable and reviewable. `skills-lock.json` pins versions.
- Review skill files before trusting them — they run with full agent permissions.


## Maintenance gates

Agent-tooling changes count as repo behavior changes. Prefer cross-agent config first: shared wrapper scripts under `scripts/`, devcontainer/common-layer setup, shared skills under `.agents/skills/` where supported, then minimal Claude/Cursor/Codex/Copilot shims. When changing one supported agent config (`.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`, `.claude/settings.json`, or setup scripts), check and update the peer configs in the same PR. Update `AGENTS.md`, this file, or another relevant README in the same change when editing `.agents/`, `.claude/`, `.codex/`, `.cursor/`, `.mcp.json`, or setup scripts. The `architecture:guard`, `docs:freshness`, CI, and `.githooks/pre-commit` gates enforce architecture evidence and documentation freshness before merge.

## Fast local checks with Turborepo

Pre-commit checks now route through `pnpm run check:relevant:staged`, which discovers staged files and runs only the gates tied to those paths. Draft proof packages under `src/draft/*` are treated as independent pnpm workspaces, so package tests run through Turborepo filters instead of replaying every proof in the repository. Protobuf/CUE edits inside draft packages stay on that isolated workspace path; only root contract/schema edits outside `src/draft/*` trigger the repository-wide `test:schema` and contract lanes. Multiple touched draft workspaces are passed to one Turbo invocation so their contract regeneration and tests can run in parallel. Independent relevant checks also run in parallel after any package-install guard, while expensive global validators stay impact-scoped: traceability runs for traceability/design-proof edits, deployment-set validation runs for that proof, and agent evals run only for eval/prompt paths. Root `package.json` changes that only add or update scripts, plus lockfile importer-only updates, still run install, root-test, standards, docs, architecture guards, and touched workspace tests, but they do not force the all-package `turbo run build typecheck lint test --filter=[HEAD^...HEAD]` lane unless `--build`, root TypeScript/Turbo/workspace config, or non-script package metadata changes request it. The selector lives in `scripts/relevant-check-policy.ts` so root tests can assert gate choice without executing those gates. If the local Turbo native binary cannot start, the relevant-check runner falls back to the equivalent `pnpm --filter ./src/draft/<package> test` command for the changed workspaces. The relevant-check path also runs `pnpm run case:check` for source or automation changes; tracked paths that differ only by case should be handled as separate Windows hygiene work instead of being folded into unrelated cleanup. Turborepo stores cache entries under `.turbo/` and reuses them across Windows, macOS, Linux, and devcontainer runs when inputs are unchanged.

On Windows, `scripts/run-relevant-checks.ts` invokes nested pnpm commands through `cmd.exe /d /c pnpm.cmd`.
This keeps the staged hook path usable in shells where `pnpm` is not directly executable from
`child_process.spawnSync(..., { shell: false })`.

Use these commands when working locally or as an agent:

- `pnpm run check:relevant:staged` before commit; this is the hook path and should stay fast.
- `pnpm run check:relevant -- --base=origin/main` while iterating on a branch; it compares changed files with the merge base.
- `pnpm run test:fast` for root test-runner smoke checks; it is root-only, quiet, and writes no runner log artifacts.
- `pnpm run test:unit:quiet` when the full unit lane is needed without heartbeat/pass spam or runner log artifacts.
- `pnpm exec turbo run test --filter ./src/draft/<package>` when editing one draft proof package.
- `pnpm run test:all` only for full-repo verification or before merging large cross-cutting changes.

The non-staged relevant-check runner forwards its selected `--base` into
`docs:freshness` so PR impact checks evaluate the same merge-base file set even
after install or generated-contract steps touch the local working tree.

When merging `origin/main` into an active proof branch, recently merged draft
workspaces may require fresh `pnpm-lock.yaml` importer entries. Keep those
lockfile updates with the merge repair and rerun the normal relevant check path
instead of treating them as unrelated churn.

Agents should prefer the narrowest command that covers the changed files, and should avoid running `pnpm test` or `pnpm run test:all` after edits that touch only one isolated draft package unless a shared script, root dependency, or contract generator changed.

### Tooling choice: pnpm + Turborepo

Research pass, 2026-06-29: Bun has the fastest headline installer and is worth revisiting for Bun-runtime packages, but this repo remains Node-based and needs strict monorepo filtering, workspace linking, lockfile auditability, and CI-compatible security gates. pnpm is the best package-manager fit for HoBo because it combines a content-addressable store, strict dependency graph, strong workspace filtering, and mature Node compatibility. Turborepo remains the task runner because it adds cross-package task caching on top of whichever package manager owns installs, without requiring the repo to adopt Vite or Bun as a runtime.

Chosen stack:

- Package manager: `pnpm@10.33.4` via `packageManager` and `pnpm-lock.yaml`.
- Task runner/cache: `turbo@2.8.6` via `pnpm exec turbo`. The pin stays below
  `2.10.x` until the Windows platform package no longer imports an unshipped
  `ghostty-vt.dll`; local and pre-commit gates must run without hidden machine
  DLLs.
- Runtime for checks: Node >=24, matching `package.json` engines.
- Bundler/dev server: none by default; add Vite only for runnable browser apps, not for docs/proof packages where it would add startup and dependency cost without serving a hot-reload UI.
- Bun: not default. Use only for isolated proof packages that deliberately target Bun APIs or can prove Node-compatibility parity and faster measured gates.

pnpm v11 build-script security is configured in `pnpm-workspace.yaml`: only `esbuild` and `protobufjs` may run install-time build scripts. The recent `turbo` and `@typescript/native-preview` platform packages are listed in `minimumReleaseAgeExclude` so the repo can intentionally use current toolchain binaries while retaining pnpm's supply-chain policy checks for the rest of the graph.

### Isolated test temp/log directories

`scripts/run-tests.ts` creates one isolated directory per invocation under the OS temp root, scoped by workspace hash and worker id: `<os-tmp>/hobo-design-tests/<workspace-hash>/<worker-id>/run-*`. Each batch receives its own child temp directory through `TMPDIR`, `TMP`, and `TEMP`, so parallel workers do not share global temp logs or unrelated temp context. Set `HOBO_TEST_TMPDIR` only when a worker needs a different temp base; the runner still creates isolated run and batch children beneath it.

The runner does not write batch logs for passing tests. Failed batches keep a bounded output tail in memory; normal runs persist that failure tail to the isolated batch directory, while `--quiet` or `--no-artifacts` keep it off disk and print it only on failure. Use `pnpm run test:fast` for a quiet, no-artifact root smoke lane. Use `pnpm run test:unit:quiet` only when full draft-unit coverage is explicitly needed; it still scans every unit test under `src/draft/*`.

### Fast docs linting

Docs linting follows the same rule as tests: local hooks lint only changed markdown. `pnpm run lint:docs:staged` reads staged paths, skips immediately when no markdown changed, and passes only relevant files into the CLI/design doc linters. It automatically falls back to a full design-doc scan when a shared catalog changes (`cli-spec.md`, glossary, ADR index, event-family catalog, or traceability), because those files can invalidate references outside the touched file set. Full lint remains available with `pnpm run lint:docs` for CI or broad documentation refactors.
