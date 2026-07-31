# OptimizeXP skill references

Progressive-disclosure bundle for the optimizexp skill. Route by need; do not load every file every run.

## Core (every run)

- [flags.md](flags.md) — experience include/exclude grammar + `--init`
- [init.md](init.md) — repo traversal → product personas + feature scaffolds
- [metrics.md](metrics.md) — harms, friction, uncertainty + HCD scoring
- [metric-scorecard.md](metric-scorecard.md) — formal `scores` on expect / act / outcome
- [agent-bus.md](agent-bus.md) — write-ahead expect / act / outcome log
- [review-loop.md](review-loop.md) — iterative reduction until plateau
- [personas.md](personas.md) — `.optimizexp/personas/*.md` → review prompts
- [features.md](features.md) — feature folders + persona Gherkin
- [evidence.md](evidence.md) — what personas see; overwrite + media policy
- [harness.md](harness.md) — capture drivers and CLI
- [pr-delivery.md](pr-delivery.md) — incremental commits, stacked PRs, post evidence
- [workflow-generation.md](workflow-generation.md) — author and regenerate agent workflows

## UX (user experience)

- [ux/design-systems.md](ux/design-systems.md) — design-system inventory and audit patterns
- [ux/design-md.md](ux/design-md.md) — DESIGN.md contracts, tokens, lint gates

## DX (developer experience)

- [dx/build-systems.md](dx/build-systems.md) — build graphs, monorepo tooling, incremental builds
- [dx/lint-typecheck.md](dx/lint-typecheck.md) — lint + typecheck feedback loops
- [dx/testing.md](dx/testing.md) — test lanes, smoke-first policy, contract/behavior tests
- [dx/dev-tools.md](dx/dev-tools.md) — local CLIs, doctor scripts, IDE/agent shims
- [dx/repo-package-hierarchy.md](dx/repo-package-hierarchy.md) — repo and package layout
- [dx/caching.md](dx/caching.md) — artifact and remote cache patterns
- [dx/git-hooks.md](dx/git-hooks.md) — git hooks, extensions, staged gates

## AX (agent experience)

- [ax/mcp.md](ax/mcp.md) — MCP servers, wiring, fail-closed posture
- [ax/agent-skills.md](ax/agent-skills.md) — skills, progressive disclosure, mirrors
- [ax/agents-md.md](ax/agents-md.md) — AGENTS.md / CLAUDE.md instruction surfaces
- [ax/agents-config.md](ax/agents-config.md) — specific agents, subagents, CLIs
- [ax/hooks-plugins.md](ax/hooks-plugins.md) — hooks, plugins, session start behavior
- [ax/auth.md](ax/auth.md) — AUTH.md, keys, egress risk, secret hygiene

## Cross-agent (hosts without native workflows)

- [cross-agent/deterministic-workflows.md](cross-agent/deterministic-workflows.md) — shared template to call deterministic code workflows
- [cross-agent/vercel-wdk.md](cross-agent/vercel-wdk.md) — Workflow DevKit / local Worlds notes

SKILL.md keeps Codex-valid frontmatter; OKF concept metadata lives in these references
(validated by `pnpm run docs:okf`; mirror equality by `pnpm run skills:mirror-check`).
