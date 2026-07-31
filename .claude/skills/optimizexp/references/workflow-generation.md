---
type: Agent Skill Reference
title: "OptimizeXP workflow generation"
description: "How to generate and maintain per-agent review workflows that drive the optimizexp loop."
tags: [hobo, optimizexp, workflows, generation]
timestamp: 2026-07-30T00:00:00Z
---

# Generating workflows

Each coding-agent host that supports workflows gets a folder under this skill:

```text
.agents/skills/optimizexp/workflows/
  claude-code/
  codex/
  cursor/
  grok/
  cross-agent/          # hosts without native workflow support
```

Mirror path: `.claude/skills/optimizexp/workflows/` (byte-identical).

## When to generate vs reuse

| Situation | Action |
|---|---|
| First run on a host | Copy the host's `review` template; fill persona list from `.optimizexp/personas/` |
| Personas or metrics schema changed | Regenerate host workflows from templates |
| One-off surface focus | Parameterize; do not fork a permanent workflow file |
| Host has no workflow runtime | Use `cross-agent/` deterministic runner |

## Workflow contract (all hosts)

Every review workflow MUST:

1. Read resolved `scope.json` (or build it from flags).
2. Load persona prompts per `references/personas.md`.
3. Enforce write-ahead bus entries before actions.
4. Score metrics per `references/metrics.md`.
5. Loop per `references/review-loop.md` + `equilibrium.md` until **pareto-equilibrium** (harm floor then delight; default infinite). Host workflow final steps **must** call `assert-complete` then `mark-complete`; product-green alone is not a terminal.
6. Write `summary.md` under the run directory.
7. **Apply reduce experiments by default** each persona review pass; only skip with `--report-only` / `--no-reduce` / `OPTIMIZEXP_REPORT_ONLY=1`.
8. **Derive → implement → continue:** known concrete fixes must land in-run; harm plateau requires empty implementable backlog (`--implementable-findings 0` on `should-stop`), not merely flat scores. Default **`--passes infinite`** until **pareto-equilibrium** (harm then delight); finite N only caps harm cycles. Invocation complete only via `assert-complete` + `mark-complete`.

## Generation steps (agent)

1. Detect host: `claude-code` | `codex` | `cursor` | `grok` | `unknown`.
2. Read `workflows/<host>/README.md` and the template file(s).
3. Enumerate personas → inject id list into the workflow parameters (do not inline full persona bodies into the workflow file; load at runtime from `.optimizexp/personas/`).
4. Enumerate selected experiences → pass as args so progressive disclosure stays valid.
5. Write generated instance to `.optimizexp/runs/<runId>/workflow/` (run-local), **or** update the skill template only when improving the shared pattern.
6. Execute via the host's native runner, or `node --import tsx` for cross-agent.

## Template variables

| Variable | Source |
|---|---|
| `{{RUN_ID}}` | generated |
| `{{EXPERIENCES}}` | flags |
| `{{PERSONA_IDS}}` | persona selection |
| `{{SURFACES}}` | scope |
| `{{REPO_ROOT}}` | cwd |
| `{{BUS_DIR}}` | `.optimizexp/bus/entries` |
| `{{REPORT_ONLY}}` | `--report-only` / `OPTIMIZEXP_REPORT_ONLY` |
| `{{ALLOW_FIXES}}` | legacy; default true (fixes on) |

## Host notes

### Claude Code

- Prefer plugin workflows / agent definitions under `.claude/` when present.
- Skill-local template: `workflows/claude-code/review.md` (prompt orchestration) + optional `review.sh`.
- Subagents may run persona passes in parallel **read-only**; bus appends stay single-writer (coordinator).

### Codex

- Prompt + script style: `workflows/codex/review.md`.
- Use `AGENTS.md` + skill path; no assumption of Rhai.

### Cursor

- Rule/skill invocation: `workflows/cursor/review.md`.
- Keep steps IDE-friendly (small file opens, no long blocking without progress).

### Grok Build

- Rhai workflow when available: `workflows/grok/review.rhai`.
- Follow Grok `create-workflow` skill conventions (`let meta = #{...}`).
- Fallback: same markdown steps as Codex if Rhai runtime absent.

### Cross-agent

- Deterministic TypeScript runner invoking steps as functions.
- Optionally integrate **Vercel Workflow DevKit** Local World for durable step replay — see `references/cross-agent/vercel-wdk.md`.
- Template: `workflows/cross-agent/review-loop.mts`.

## Do not

- Commit run-local workflow instances under `workflows/` (they belong in `.optimizexp/runs/`).
- Duplicate metric/bus schema into each host file — point at references.
- Generate workflows that skip the agent bus.
