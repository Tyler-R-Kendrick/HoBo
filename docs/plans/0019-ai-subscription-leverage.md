---
type: Implementation Plan
title: "AI-subscription leverage plan — devex, UX, and agent-ops automation"
description: "Audit of every AI subscription/integration available to this repo (Claude Max, GitHub, Linear, Figma, PostHog, Supabase, Vercel, fal.ai, Higgsfield, plus local OSS agent tooling) against the repo's actual automation surface, with SOTA-informed (2025–2026) recommendations: scheduled Claude Routines, dependency/release plumbing, filling the empty agent-eval harness, PostHog instrumentation and error auto-triage, OptimizeXP loop closure, Figma bidirectional design review, and agent cost/observability discipline — each scoped to the repo's local-gates-only and runner-budget constraints."
tags: [hobo, plans, agent-tooling, automation, devex, ux]
---

# AI-subscription leverage plan

**Question answered:** how to better use the AI subscriptions already paid for to
automate and improve this project, from devex to UX and beyond.

**Method:** repo automation audit (workflows, hooks, scripts, `.optimizexp/`,
`site/`, plans register) + SOTA research sweep (Anthropic engineering posts,
GitHub Continuous AI, PostHog AI, Linear Agent, Vercel Agent, 2025–2026 papers).
Sources are linked inline; a consolidated list closes the doc.

## 1. Inventory — what is paid for vs. what is used

| Subscription / integration | Wired today | Utilization |
|---|---|---|
| **Claude Max** (Claude Code CLI/web, Routines, Agent SDK, `claude-code-action`) | ~50 committed skills, sdlc/optimizexp harnesses, `.claude/agents/{implementer,reviewer}.md` | **High interactively, zero scheduled.** No Routine, no Action, no headless `claude -p` lane. |
| **GitHub** (Actions, Copilot code review, gh-aw) | 12 workflows, credit-rebalancing (`rebalance-runners.yml`) | CI only — **no AI step in any workflow**; Copilot review unused. |
| **Linear** (MCP; Linear Agent skills + Guidance) | sdlc skill files issues to Linear; `docs/plans/production-build-backlog.md` scoped as Linear issues | Issue store only. No Guidance, no agent skills, no assignable agent, no automated grooming. |
| **Figma** (MCP; Code Connect, `generate_figma_design`) | Nothing in-repo | **Unused.** |
| **PostHog** (analytics, session replay AI, error tracking MCP, LLM analytics, experiments) | Org exists ("QuickDeployAI", default project) | **Unused — zero instrumentation anywhere** (`grep -ri posthog site/ packages/` finds only product-code mentions of providers). |
| **Vercel** (deploys, Vercel Agent code review/investigations, Sandbox) | One dispatch-only example deploy (`deploy-hello-bindle-vercel.yml`) | Near-zero. Site ships to GitHub Pages with no previews. |
| **Supabase** (MCP) | Modeled as a provider offering in `@hobo/core` only | Unused as infrastructure. |
| **fal.ai** (`FAL_KEY`) + **Higgsfield** (OAuth) | spriterrific CLI skill; higgsfield-auth device-flow skill | Working, on-demand art pipeline. Adequate. |
| **Local OSS agent stack** (Serena, headroom, gbrain, caveman, RTK, tgrep, ast-grep, SkillOpt, superpowers, impeccable, optimizexp) | `.mcp.json`, mirrored skills, setup script | Strong — except **SkillOpt has never been run** and OptimizeXP output is not consumed (§5). |

The headline: the interactive-agent story is genuinely SOTA, but everything
*scheduled, evented, or measured* is missing. The 2025→2026 industry arc is
exactly that gap — scheduled/event-driven agents became a first-class product
surface (Claude Routines, [GitHub Agentic Workflows](https://github.github.com/gh-aw/),
[Linear Agent](https://linear.app/changelog/2026-03-24-introducing-linear-agent),
[Vercel Agent](https://vercel.com/docs/agent)), with the differentiator being
*what check gates their output*, not whether they can run
([GitHub Continuous AI](https://github.blog/ai-and-ml/generative-ai/continuous-ai-in-practice-what-developers-can-automate-today-with-agentic-ci/)).

## 2. Constraints any of this must respect

Established repo policy, not up for silent revision:

1. **Gates are local hooks only** (commit `dc525381`, PRODUCT.md, sdlc
   `references/finish.md`): agents must not treat GitHub Actions as required
   gates. → New AI automation runs as **Claude Routines on Anthropic infra**
   or **advisory (never required) Action lanes**; nothing below adds a
   required check.
2. **Runner budget is actively managed** (`rebalance-runners.yml` flips
   `HOBO_RUNNER_LINUX_SMALL` daily to burn free credits). Routines cost zero
   runner minutes — another reason to prefer them over cron Actions.
3. **Cost-gated lanes are label-gated on purpose** (`hobo/e2e`,
   `hobo/behavior-fixture`); auto-labeling must never trip them.
4. **Agent-native guardrails bind autonomous principals**
   (`docs/automations/hobo-issue-worker.md` → BR-011/FR-022/ADR-0094):
   `AUTO_MERGE=false`, never push `main`, claim protocol, fail-closed on red
   gates, narrow `agent:check` scope. Every Routine proposed below inherits
   this mapping.
5. **ADR-0023 inert tool output:** issue/PR/replay/error prose read by any
   triage agent is untrusted data and can never widen a grant — the same
   invariant the `s3-stage-gate.yml` adversarial job already tests for MCP.
6. `docs:freshness`, skill-mirror gate, `site/DESIGN.md` authority
   (ADR-0149), conventional commits, secrets-by-name.

## 3. Lane A — scheduled agents (Claude Max Routines): the biggest unclaimed win

Routines (Anthropic-managed scheduled sessions, created at claude.ai/code or
`/schedule`) are the perfect fit for this repo *because of* constraint 1–2:
they run off GitHub, spend Max-subscription tokens instead of runner credits,
and report back as PRs/issues — the "safe outputs" shape Continuous AI
recommends.

- **A1 — Schedule `workflows/stale-pr-cleanup.md` (S).** The spec already
  exists, complete with a parallel-safe claim/yield protocol
  (`🤖 CLAIM run=<id>`); nothing schedules it. A daily Routine whose prompt is
  "execute `workflows/stale-pr-cleanup.md` exactly as written" closes the gap
  with zero new design.
- **A2 — Weekly repo-health reporter (S).** One Routine that: parses
  `docs/plans/dispatch-log.md` into dispatch success/failure counts (today it
  is append-only prose nothing reads); runs `check-gaps-register-lag.ts` and
  `check-ship-gap-closure.mts` off the changed-paths router so the 2,043-line
  `GAPS.md` and the plans register can't silently go stale; ages
  `.optimizexp/backlog/experiments.json` deferred items; files one digest
  issue. This is GitHub's "cross-repo reporting" Continuous AI archetype.
- **A3 — Issue-intake triage Routine (S).** There is no
  `.github/ISSUE_TEMPLATE/`, no labeler, no CODEOWNERS — yet two lanes only
  run when a human types a label. A triage Routine labels/duplicates/asks for
  repro on new issues (mirroring
  [githubnext/agentics auto-triage](https://github.com/githubnext/agentics),
  with confidence + rationale in the label comment), but is **denylisted from
  the cost-gate labels** per constraint 3. Complements — not replaces — the
  external Codex issue-worker (`docs/automations/hobo-issue-worker.md`), which
  stays the *fixer*; this is the *sorter*.
- **A4 — Docs-freshness sweep (M).** `docs:freshness` forces docs beside code
  at commit time, but nothing re-reads old docs against drifted code. A weekly
  Routine samples design docs/READMEs against current package behavior and
  opens a small PR per confirmed drift (the doc/code-alignment archetype from
  the Continuous AI post).

## 4. Lane B — dependency, release, and review plumbing (GitHub + Claude)

- **B1 — Renovate for mechanical bumps + Claude for breakage repair (M).**
  There is no dependabot/renovate config, and lockfile drift already caused a
  main-gate outage (`docs/plans/0004-main-gate-repair.md`). Route by
  mechanicalness (the model-routing discipline —
  [routing guide](https://www.digitalapplied.com/blog/llm-model-routing-2026-cost-quality-optimization-engineering-guide)):
  Renovate opens deterministic bump PRs (landing on the existing
  `licenses:check` gate and pnpm `minimumReleaseAge` policy); a Routine
  watches red bump PRs and pushes repair commits. Renovate's app runs on its
  own infra — zero runner cost; local hooks stay the gate.
- **B2 — Changeset-consuming release lane behind the 0018 gate (S).**
  `.changeset/` has two pending entries nothing consumes, and
  `hobo-ci.yml:24` reserves the slot ("Future Changesets publish automation
  must declare `needs: artifact-trust`"). The *design* is owner-gated in
  [`0018-npm-publish-design.md`](./0018-npm-publish-design.md) — do not
  re-litigate it; just add the version-PR + changelog-drafting plumbing
  (dispatch-only, dry-run default) so the human go-decision is one click, and
  have Claude draft release notes from merged conventional commits.
- **B3 — Advisory AI code review, never required (S).**
  Two zero-effort options already in hand: GitHub Copilot review
  (`request_copilot_review` is already exposed via MCP) and
  [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action)
  with a repo-specific checklist (its
  [solutions.md](https://github.com/anthropics/claude-code-action/blob/main/docs/solutions.md)
  has path-scoped review recipes) — pointed at the things generic review
  can't know: ADR-0135/0144/0146 conformance, parse-don't-validate, PACT
  boundary rules. Anthropic's own guidance: bound reviewers to correctness or
  they invent findings and drive over-engineering
  ([best practices](https://code.claude.com/docs/en/best-practices)). Runs
  `continue-on-error`, non-required, per constraint 1. If site previews move
  to Vercel (E5), [Vercel Agent review](https://vercel.com/docs/agent) adds
  sandbox-validated patches at $0.30/review.

## 5. Lane C — measure the agents themselves (evals + SkillOpt)

- **C1 — Fill the empty eval harness (M, highest scaffolding-to-coverage
  ratio in the repo).** `scripts/run-tests.ts` already defines
  `evals/**/*.mock.test.ts` / `.live.test.ts` categories and `pnpm run
  eval:agent` — which passes **vacuously** because zero matching files exist,
  while `packages/evals` (`@hobo/evals`) and four draft eval proofs model
  evals as *product*. Eat the dogfood: seed mock evals for the highest-traffic
  skills (sdlc dispatch decisions, repo-skill search-before-validate ordering,
  optimizexp scorecard math) and wire `eval:agent` into the weekly cron lane.
  Deterministic checks first; LLM-as-judge only for genuinely subjective
  criteria ([Braintrust guidance](https://www.braintrust.dev/articles/what-is-llm-as-a-judge)).
- **C2 — Run SkillOpt against the scored tasks C1 creates (M).** SkillOpt is
  installed (`skillopt-train`/`skillopt-sleep`, repo runner
  `scripts/skillopt-sleep.sh`) and has never been run. Its loop — scored
  rollouts proposing bounded skill edits, accepting only
  validation-improving candidates — needs exactly the scored tasks C1
  produces. Start with the `mock` backend (no spend), then
  `--backend claude` on the sdlc and repo skills.
- **C3 — Agent observability with what's already paid for (S).** Claude Code
  emits OpenTelemetry GenAI-convention traces; PostHog LLM analytics ingests
  them and joins agent cost/latency/failure with product analytics
  ([PostHog AI observability](https://posthog.com/ai-observability)). One env
  var + one dashboard answers "what does a dispatch cost and which skills
  burn the budget" — data the dispatch-log Routine (A2) currently can only
  approximate from prose.

## 6. Lane D — UX: turn PostHog on, then point agents at it

Every downstream AI capability here is dead until the site emits events —
this is the single cheapest unlock in the whole plan.

- **D1 — Instrument `site/` with PostHog (S).** Pageviews, web vitals,
  rage/dead clicks, the examples console funnel. The site currently has *no*
  analytics, no feedback widget, and its own deploy script docstring admits
  the live site once sat stale for weeks unnoticed.
- **D2 — Error tracking + MCP auto-triage Routine (M).** PostHog's own
  dogfood run closed 4,000+ tracked errors via agents
  ([writeup](https://posthog.com/blog/agents-closed-4063-errors), May 2026);
  the [MCP path](https://posthog.com/docs/error-tracking/debug-errors-mcp) is
  documented and maps 1:1 onto a weekly Routine: fetch top issues by
  users-affected, propose fixes as PRs (guardrails per constraint 4), update
  issue status. Error text is untrusted input per constraint 5.
- **D3 — Session-replay AI summaries feeding OptimizeXP (M).**
  [Replay summaries](https://posthog.com/docs/posthog-ai/session-summaries)
  read the structured event stream, not video — cheap to run per release.
  Real-user confusion signals become inputs to `.optimizexp/` features, which
  today rest entirely on synthetic personas. The 2025–2026 literature
  (UXAgent [arXiv:2504.09407](https://arxiv.org/abs/2504.09407), and the
  human-misalignment critiques) says synthetic findings are
  hypothesis-generators, not evidence — replay data is the evidence half
  OptimizeXP is missing.
- **D4 — Close the OptimizeXP loop (S).** `optimizexp:lint-runs` is not in
  `check:all`; `post-pr-evidence.mts` exists but nothing calls it; the bus
  directory is empty; deferred backlog items have no aging signal. Add
  lint-runs to `check:all`, call post-pr-evidence from the sdlc finish path,
  and let the A2 Routine age the backlog into Linear issues. (Five of ten
  live initiative dirs are OptimizeXP-related — check their `sdlc-state.md`
  before starting, per the plans-register overlap rule.)
- **D5 — Accessibility: deterministic gate + agent audit (M).** The 2026
  pattern ([composable a11y agents](https://testeragents.com/accessibility-testing-ai/)):
  axe-core as a *local* hard gate on `site/` builds (fits constraint 1 —
  it's a pnpm script, not an Action), plus an advisory agent pass over the
  built site testing keyboard nav/focus via the accessibility tree — pure
  scanners cover ~30% of WCAG; the agent layer pushes toward 55–60%.
  `site/scripts/design-audit.mts` already exists and is unwired; extend it
  rather than adding a new tool.

## 7. Lane E — design pipeline (Figma) and remaining surfaces

- **E1 — Figma Code Connect for site + pixel-village components (M).** Map
  Figma components to real imports so design-to-code output composes existing
  components instead of reinventing them
  ([Figma MCP guide](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)).
- **E2 — Bidirectional design review via `generate_figma_design` (S).**
  The Feb-2026 Claude-Code-exclusive tool captures running UI into editable
  Figma layers — push the live site into Figma, critique against
  `site/DESIGN.md` (which stays authority, ADR-0149), round-trip fixes with
  `/impeccable critique`.
- **E3 — Linear Guidance + agent skills (S).** Write workspace/team
  [Guidance](https://linear.app/docs/agents-in-linear) (repo, branch naming,
  `agent:check` expectations, claim protocol) so *any* agent working a Linear
  issue — including third-party assignable agents later — inherits repo rules
  without prompt duplication. Save the recurring "groom production-build
  backlog" flow as a Linear agent skill; the MCP already exposes
  `list_agent_skills`/`get_agent_skill`.
- **E4 — Context economics: codify what already works (S).** caveman,
  headroom, RTK, and the subagent-heavy sdlc are aligned with published
  direction (ACON [arXiv:2510.00615](https://arxiv.org/pdf/2510.00615);
  code-execution-over-MCP cut one workflow 150k→2k tokens,
  [98.7% reduction](https://simonwillison.net/2025/Nov/4/code-execution-with-mcp/)).
  Two cheap additions: order skill/prompt content stable-first for
  [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
  (up to 90% off cached reads), and pin cheap models on mechanical subagents
  via per-agent `model:` in `.claude/agents/` — production mixes route ~70%
  of steps to cheap tiers.
- **E5 — Optional: Vercel preview deploys for `site/` (M).** Keeps GitHub
  Pages as production (no policy change) but adds preview URLs per PR —
  which unlocks Vercel Agent review (B3), toolbar-comment feedback, and a
  target for the D5 agent audit. Only worth it once D1 exists.

## 8. Rollout order

Sequenced by unlock-value over effort; S/M/L per the 0017 effort classes.

| Wave | Items | Rationale |
|---|---|---|
| **1 (this week)** | D1 (PostHog on site) · A1 (schedule stale-pr-cleanup) · A2 (repo-health Routine) · D4 (OptimizeXP loop) | D1 unlocks all of Lane D; A1/A2 are pure scheduling of specs and scripts that already exist. |
| **2 (this month)** | B1 (Renovate + repair Routine) · C1 (fill eval harness) · B3 (advisory review) · E3 (Linear Guidance) · A3 (issue triage) | Dependency outages have already happened once; C1 makes every later agent change measurable. |
| **3 (this quarter)** | C2 (SkillOpt) · C3 (LLM analytics) · D2 (error auto-triage) · D3 (replay→OptimizeXP) · D5 (a11y) · A4 (docs drift) · E1/E2 (Figma) · B2 (release plumbing) · E5 (previews) | Each depends on a Wave-1/2 foundation (scored tasks, telemetry, previews, changeset gate). |

## 9. Consolidated sources

- Anthropic: [Claude Code best practices](https://code.claude.com/docs/en/best-practices) · [claude-code-action](https://github.com/anthropics/claude-code-action) + [solutions.md](https://github.com/anthropics/claude-code-action/blob/main/docs/solutions.md) · [Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) · [long-running agent harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) · [writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) · [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- GitHub: [Continuous AI in practice](https://github.blog/ai-and-ml/generative-ai/continuous-ai-in-practice-what-developers-can-automate-today-with-agentic-ci/) · [gh-aw](https://github.github.com/gh-aw/) · [agentics samples](https://github.com/githubnext/agentics)
- PostHog: [AI observability](https://posthog.com/ai-observability) · [session summaries](https://posthog.com/docs/posthog-ai/session-summaries) · [agents closed 4,063 errors](https://posthog.com/blog/agents-closed-4063-errors) · [error-tracking MCP](https://posthog.com/docs/error-tracking/debug-errors-mcp)
- Linear: [Linear Agent](https://linear.app/changelog/2026-03-24-introducing-linear-agent) · [agents docs](https://linear.app/docs/agents-in-linear)
- Vercel: [Vercel Agent](https://vercel.com/docs/agent)
- Figma: [MCP server guide](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- Evals: [Braintrust LLM-as-judge](https://www.braintrust.dev/articles/what-is-llm-as-a-judge) · [eval tools in CI/CD](https://www.braintrust.dev/articles/best-ai-evals-tools-cicd-2025)
- Research: UXAgent [arXiv:2504.09407](https://arxiv.org/abs/2504.09407) · ACON context compression [arXiv:2510.00615](https://arxiv.org/pdf/2510.00615) · [code execution with MCP](https://simonwillison.net/2025/Nov/4/code-execution-with-mcp/) · [model routing](https://www.digitalapplied.com/blog/llm-model-routing-2026-cost-quality-optimization-engineering-guide)
