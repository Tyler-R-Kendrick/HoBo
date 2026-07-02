---
name: sdlc
description: Coordinate iterative feature/capability development end to end - brainstorm with adversarial and rubber-duck hardening, plan through the draft-proof cascade, capture delivery in Linear as one-shot issues, then (with user permission) dispatch implementation agents through the harness-appropriate backend (cloud coding agents preferred for isolated issues; local subagent worktrees otherwise) with red/green TDD/BDD/ATDD. Use when the user wants to develop a feature, capability, or improvement through the full loop, or says "sdlc", "run the loop", or "take this from idea to issues".
---

# SDLC coordinator

Drive a feature or capability through the full development loop. You are the **coordinator**: you
own the conversation with the user, the plan, all Linear state, and all shared-file mutations.
Implementation agents — cloud coding agents or local subagents, chosen per issue via the backend
matrix in `references/dispatch.md` — own exactly one issue each, in their own isolation (cloud VM
or worktree), and never touch Linear or shared files.

## Durable state (read this FIRST, every session)

State lives in `docs/plans/<initiative-slug>/sdlc-state.md` (phase, decisions, dispatched issues →
worktree/branch/PR). On entry: read it; if it exists, **reconcile before anything else** (see
`references/dispatch.md` § Resume). Write it at every phase boundary. Dispatch outcomes append to
`docs/plans/dispatch-log.md`.

## Phases (details in references/)

1. **Brainstorm & harden** — `references/brainstorm.md`. Always start here for new
   features/capabilities. Ideas must survive adversarial + rubber-duck passes before planning.
2. **Plan** — `references/planning.md`. Enter plan mode; map the work onto the draft cascade
   (technical proofs → epic proofs; experience proofs in parallel; project proofs aggregate);
   every proof change follows plan → improve → ADR-beside-the-proof; new tech/screens/features go
   through the **draft** skill.
3. **Linear capture** — `references/linear-planning.md`. Initiative/projects/milestones/issues,
   each issue a self-contained one-shot contract with verifiable outputs and required draft
   artifacts named explicitly.
4. **Dispatch** — `references/dispatch.md`. ONLY after explicit user permission. Detect the
   harness's delegation backends, claim the issue in Linear, then dispatch via the backend
   matrix (cloud coding agent for isolated issues; `implementer` subagent worktree otherwise;
   sequential fallback when nothing probes true). An independent review pass plus
   GitHub-reported checks decide Done — never the implementation agent's word.
5. **Loops & cascade** — `references/loops-and-gates.md` + `references/cascade.md`. Red/green
   inner loop, narrow-then-wide outer loop, and machine-checked upward/downward requirement
   cascades.

## Hard rules

- Interactive stages (brainstorming, plan approval, dispatch permission) happen in the MAIN
  conversation — subagents cannot ask the user anything.
- One writer per shared file: Linear, `docs/design/traceability.md`, ledgers, registries, GAPS-style
  registers, and the state file are coordinator-only. Implementation agents report deltas via the
  handback schema (`.sdlc/report.json` locally, a fenced `sdlc-report` block on cloud PRs); you
  apply them serially.
- An issue is Done only when (a) GitHub reports the PR checks green — queried by you, not taken
  from the implementation agent — and (b) the independent review pass succeeds.
- Perf, contract (PACT), and feature (cucumber) tests are first-class: acceptance criteria become
  failing tests before implementation starts.
