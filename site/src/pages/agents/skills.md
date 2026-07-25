---
layout: ../../layouts/Docs.astro
title: Skills & workflows
description: "The repo-local repo, draft, and sdlc skills: the performance-first loop, the four-layer proof taxonomy, and the coordinated implementer/reviewer development cycle."
---

# Skills & workflows

Three repo-local skills encode how work actually flows through this repository. They live mirrored in `.claude/skills/` (Claude Code) and `.agents/skills/` (Cursor/Codex); a gate asserts the mirrors stay byte-identical.

## `repo` — repository lifecycle

Used for setup, search, scoped implementation, validation, commits, PR handoff, and cleanup. It encodes the **performance-first loop**:

```text
Search before validate.
Validate changed scope before package scope.
Validate package scope before repo scope.
Use fast approximate tools first.
Use exact/slow compatibility tools last.
```

Search defaults to local hybrid retrieval — OKF `index.md` files, `tgrep`, `rg`, `fd`, `ast-grep`, `git grep` — with semantic/memory tools only after exact search narrows the question. Core rules it repeats: preserve user work, `git mv` for tracked moves, rebase on `origin/main`, run the narrowest relevant `agent:check` scope, and open an auto-merge squash PR only after checks and comments are clean.

## `draft` — executable proof material

Governs the four-layer proof taxonomy under `src/draft/`:

| Layer | Path | Proves |
|---|---|---|
| Technical proofs | `src/draft/technical-proofs/<slug>` | Isolated atomic technical concepts. |
| Experience proofs | `src/draft/exp-proofs/<type>/<slug>` | DX / UX / CX / AX / API experiences, grouped by type. |
| Epic proofs | `src/draft/epic-proofs/<slug>` | Epic rollups reusing technical + experience proofs. |
| Project rollups | `src/draft/projects/<slug>` | Project MVP integrations of epic proofs. |

Two gates run automatically through `agent:check`:

- **`draft:artifacts`** — per-layer requirements from each package's `proof.json`: gate-*executed* `examples/`, an executed notebook, a bench for technical proofs, executable cucumber features for epics. Waivers need an ADR.
- **`draft:cascade`** — changing a technical/exp proof must update every referencing epic/project rollup in the same diff.

When a proof is **promoted** into a production package, the package copy becomes canonical and the proof is frozen (recorded in `scripts/promotions.json`); editing a frozen proof fails CI.

## `sdlc` — the coordinated development loop

The full-loop skill: **brainstorm → adversarial/rubber-duck hardening → plan over the proof cascade → capture in Linear as one-shot issues → permission-gated dispatch to implementation agents**.

Key properties:

- **One-shot issue contract.** Every issue names its verifiable outputs and required draft artifacts; every backend returns the same handback schema (`.sdlc/report.json`, or a fenced report block in a PR body for cloud dispatches).
- **Backend matrix.** Cloud coding agents are preferred for isolated issues; local subagent worktrees handle shared-file-adjacent work; a sequential fallback keeps the loop alive.
- **implementer subagent** — one Linear issue, one isolated worktree, strict red/green TDD/BDD/ATDD (the acceptance checklist becomes the failing tests). No Linear access; never edits shared files.
- **reviewer subagent** — read-only; independently re-runs the gates and walks the acceptance checklist.
- **The Done rule.** An issue is Done only when GitHub reports PR checks green **and** the independent review passes — never on an implementer's self-report.
- **Single-writer coordination.** The coordinator owns all Linear state and shared-file mutations; durable loop state lives in `docs/plans/<initiative>/sdlc-state.md`.

## Installed skill packs

Beyond the repo-local three: `improve` (read-only audit → plans), the `superpowers` methodology plugin, `mattpocock/skills` engineering disciplines, `caveman` (terse output, on by default), and `ponytail` (minimalism on demand). See [Tooling & MCP](/HoBo/agents/tooling/).
