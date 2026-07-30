# Initiative: sdlc + official GitHub stacked PRs

**Phase:** closed  
**Slug:** `sdlc-gh-stack`  
**Opened:** 2026-07-30  
**Closed:** 2026-07-30  

## Goal

Install and configure GitHub's official `github/gh-stack` extension; expand the mirrored
**sdlc** skill so all agents (Claude Code, Cursor, Codex, Grok, …) run multi-phase work with
subagent incremental checkins, parent-owned stacks, and bottom-up rubber-duck/adversarial
closeout with per-PR squash-merge. Clarify that **billing-only CI failures do not block
squash-merge**.

## Decisions

- Stack CLI: official `gh extension install github/gh-stack` (not Graphite).
- Agent availability: dual-mirror `.agents/skills` + `.claude/skills` (required for `sdlc`).
- Companion skill `gh-stack` for non-interactive CLI rules.
- Setup: `scripts/setup-agent-tools.sh` common layer + `scripts/install-hooks.mts` sets
  `rerere.enabled` and `remote.pushDefault=origin`.
- Closeout: bottom-up per PR; billing/spending-limit red checks → document + **squash-merge now**.

## Kill-log / adversarial notes

- Avoid inventing a parallel stack tool when GitHub ships `gh-stack`.
- Do not stall on CodeRabbit Free rate limits — not a merge gate.
- Do not treat empty-step billing failures as code defects.

## Delivered PRs

| PR | Title | Result | Notes |
|---|---|---|---|
| [#958](https://github.com/Tyler-R-Kendrick/HoBo/pull/958) | feat(agents): sdlc stacked PRs via official gh-stack | squash-merged `8ceefaae` | CI never started (billing/spending limit); documented + merged |
| (follow-up) | docs(agents): billing-red CI must not block squash-merge | this closeout | skill text + state + dispatch-log |

## Stack topology

Single-layer / sequential PRs for tooling docs (not a multi-layer product stack).

## Billing-budget exceptions

- **2026-07-30 PR #958:** all fabric/S0 jobs failed with annotation  
  "The job was not started because recent account payments have failed or your spending limit
  needs to be increased." Empty steps, no runner. Squash-merged under exception.
