# CLAUDE.md

**Repo:** HoBo — a cloud-agnostic, AI-native hosting platform, currently in the **design phase** with an initial **production `packages/` scaffold** (S0-01). The design suite is in [`docs/design/`](docs/design/index.md); formal requirements are archived in [`docs/archive/requirements/`](docs/archive/requirements/index.md); competitor research is in [`docs/competitors/`](docs/competitors/index.md). Production package skeletons live under `packages/`; draft proofs and agent tooling remain under `src/draft/` and `.agents/`/`.claude/`/`scripts/`.

## Agent tooling
The repo-local **sdlc** skill runs the full dev loop (brainstorm→plan→Linear→gated dispatch to `.claude/agents/` implementer/reviewer subagents in worktrees, incremental checkins, parent-owned GitHub stacked PRs via `gh stack`, bottom-up rubber-duck/adversarial review + squash-merge per PR); companion **gh-stack** skill covers non-interactive CLI; **draft** governs proof material with gate-enforced artifacts (`proof.json`, executed examples, notebooks, cucumber features via `pnpm run test:behavior`).
This repo is wired with the agent tools listed in the docs/agent-tooling.md table for Claude Code, Cursor, and Codex (Superpowers also targets GitHub Copilot CLI) — see **[`AGENTS.md`](AGENTS.md)** for the full table and **[`docs/agent-tooling.md`](docs/agent-tooling.md)** for setup/keys/risks. Quick map:
- **improve** — `/improve` audits the repo and writes plans to `docs/plans/` (read-only).
- **superpowers** (`obra/Superpowers`) — plugin: dev methodology (brainstorming, writing-plans, code-review, TDD, debugging); enabled repo-wide via `.claude/settings.json`; loads at session start.
- **mattpocock/skills** — engineering disciplines incl. **`grill-with-docs`** (design interview → ADRs+glossary), `domain-modeling`, `codebase-design`, `tdd`; one-time `/setup-matt-pocock-skills` to configure.
- **caveman** — terse-output compression (active by default; `/caveman` to adjust).
- **ponytail** — minimalist-solution skill (YAGNI/stdlib-first); `/ponytail`, `/ponytail-review`, `/ponytail-audit` (invocation-based, no keys).
- **headroom** — MCP server compressing context fed to the model (`mcp__headroom__*`).
- **gbrain** — MCP server for knowledge-graph memory (needs `gbrain init` + an embedding key; **sends content to that provider**).

Install the binaries once with [`scripts/setup-agent-tools.sh`](scripts/setup-agent-tools.sh). MCP servers are defined in `.mcp.json` (auto-discovered).

## Working norms
- This is a documentation repo: prefer editing the numbered design docs; keep cross-doc links valid (relative `.md` links).
- Follow the HoBo implementation architecture rules in [`AGENTS.md`](AGENTS.md): PACT at service boundaries, protobuf plus CUE for records/messages/data/objects, project-local `data-models/` folders for CUE-constrained types, parse-don't-validate derived types, and event-driven CQRS/actors/materialized views.
- **Durable EventStore (ADR-0135):** default SQLite behind ports (`@hobo/storage-sqlite`, `@hobo/runtime-local`, `@hobo/runtime-browser`); one partition / one writer; stream-head CAS + fencing; never multi-writer NFS WAL. See AGENTS.md “Portable SQLite EventStore”.
- **Contract effects (ADR-0136):** optional `EffectSpec` + secondary `ResilienceProfile` on BoundaryContract; effect widening can break can-deploy; never retry `policy.Decided`/terminal; no Effect-TS/Polly/XState public deps. See AGENTS.md “Contract effects + visible resiliency”.
- Site/agents/OKF: design suite under `docs/design/` (OKF bundle; `pnpm run docs:okf`); GitHub Pages from `site/` (Astro → `gh-pages`); agent briefing `site/public/llms.txt` + `/llms-full.txt`.
- Run `npm run architecture:guard` for implementation-package changes; pre-commit runs the staged variant before the slower tests.
- Conventional, scoped commits.
