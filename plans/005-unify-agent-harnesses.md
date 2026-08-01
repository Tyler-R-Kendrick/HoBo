# Plan 005: Route every AI harness through one tested state machine

> **Executor instructions**: Execute this only after plans 001-004 are done.
> Run every verification and update `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat f14f1be2 -- .agents/skills/optimizexp/workflows .claude/skills/optimizexp/workflows package.json scripts/relevant-check-policy.ts test/relevant-check-policy.test.ts docs/agent-tooling.md`
> and
> `git status --short -- .agents/skills/optimizexp/workflows .claude/skills/optimizexp/workflows package.json scripts/relevant-check-policy.ts test/relevant-check-policy.test.ts docs/agent-tooling.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans 001, 002, 003, 004
- **Category**: dx
- **Planned at**: commit `f14f1be2`, 2026-07-31

## Why this matters

Claude, Codex, Cursor, and Grok currently receive different prompt-only
workflows. Grok still stops at forbidden legacy terminals and returns success
after a hard 100-loop guard. Claude's shell helper writes an incomplete scope
instead of invoking canonical initialization. No repository gate runs the
OptimizeXP contract tests when the skill changes. Thin adapters around one
runner are the smallest durable cross-harness solution.

## Current state

- `workflows/grok/review.rhai:35-37` says stop at metrics-zero or irreducible.
  Lines 51-86 cap at 100, omit equilibrium/assert/mark, and return success.
- `workflows/claude-code/review.sh:4-20` hand-writes a partial `scope.json`
  without stop policy, regime, status, or `INCOMPLETE.md`.
- `workflows/codex/review.md` and `workflows/cursor/review.md` are short prose
  references; neither provides executable conformance or result propagation.
- `workflows/claude-code/review.md:49-80` carries the most complete prompt, but
  mutation, feedback, and completion enforcement live only in instructions.
- `scripts/relevant-check-policy.ts:326-337` selects mirror checking only for
  `draft|repo|sdlc`, omitting `optimizexp`.
- `package.json:14` has `skills:mirror-check` but no `test:optimizexp` command.
- A focused audit run on 2026-07-31 produced 1/6 passing in
  `review-loop-stop-gate.test.mts`; the test path is not on the repo gate.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| OptimizeXP contract | `pnpm run test:optimizexp` | exit 0; all OptimizeXP harness tests pass |
| Policy test | `pnpm run test:file test/relevant-check-policy.test.ts` | exit 0 |
| Mirrors | `pnpm run skills:mirror-check` | exit 0 |
| Standards | `pnpm run standards:check -- --base=origin/main` | exit 0 |
| Staged gate | `pnpm agent:check -- --staged` | exit 0 and includes OptimizeXP tests for skill changes |

## Scope

**In scope**:

- `.agents/skills/optimizexp/workflows/{claude-code,codex,cursor,grok,cross-agent}/**`
- Matching `.claude/skills/optimizexp/workflows/**`
- `.agents/skills/optimizexp/references/workflow-generation.md` and mirror
- `package.json`
- `scripts/relevant-check-policy.ts`
- `test/relevant-check-policy.test.ts`
- OptimizeXP harness tests only where adapter conformance needs cases
- `docs/agent-tooling.md`
- `plans/README.md` (status row only)

**Out of scope**: changing state semantics from plans 001-004, dependencies,
lockfiles, actual host installation/config, live `.optimizexp` runs, and product
code.

## Git workflow

- Branch: `advisor/005-optimizexp-harness-conformance`
- Commit example: `fix(optimizexp): unify host workflow semantics`.
- `package.json` is explicitly authorized here because a test script is required;
  do not change dependencies or `pnpm-lock.yaml`.
- Do not push or open a PR unless instructed.
- Before each incremental commit, stage only that step's in-scope files plus the
  status row when it changes, then run `pnpm agent:check -- --staged`.
- Before declaring the branch complete, run `git fetch origin`, rebase on
  `origin/main`, then run `pnpm agent:check -- --base=origin/main`.

## Steps

### Step 1: Define a small adapter conformance contract

For each host, assert that init delegates to canonical `review-loop --mode init`,
report-only and scope flags are preserved, resume uses status, and completion
calls canonical equilibrium/assert/mark. Executable adapters (Claude shell and
Grok, if retained as executable Rhai) must propagate non-terminal/failure exit
status and are tested with invocation capture. Codex/Cursor Markdown workflows
are documentation adapters: validate them with static command-contract tests,
not fictitious process execution. They must name the exact canonical commands,
state that the host preserves their exit status, and own no lifecycle state.
No adapter may own stop predicates or write scope files directly.

Use fixture/fake invocation capture; do not require installed Claude, Cursor,
Codex, or Grok binaries.

**Verify**: conformance tests fail for current Grok and Claude shell adapters.

### Step 2: Reduce host workflows to transport-only adapters

Replace duplicated lifecycle prose/code with the shortest host-native wrapper
that calls the canonical runner and presents persona judgment steps. Delete the
legacy Grok metrics-zero/irreducible and unconditional-success logic. Replace
Claude's hand-written initializer with canonical init. Codex/Cursor docs must
name exact commands and preserve exit status; they must not invent state.

If Grok cannot express the full loop safely in Rhai, make its native file invoke
or instruct the tested cross-agent runner and fail closed rather than maintain a
second state machine.

**Verify**: executable adapters pass the same fixture matrix for normal,
report-only, mismatch feedback, remaining candidate, Pareto candidate, and
failed completion. Static tests prove the Codex/Cursor workflows reference the
same command sequence and contain no competing state mutation or stop terms.

### Step 3: Add one focused repository test entrypoint

Add `test:optimizexp` to `package.json` using Node's existing TypeScript test
runner over `.agents/skills/optimizexp/harness/test/*.test.mts`. Repair the test
invocation so failures show individual cases and the full set exits 0.

Update `selectRelevantChecks` so changes under either mirrored OptimizeXP skill
run `skills:mirror-check` and `test:optimizexp`. Add exact policy tests for both
`.agents` and `.claude` paths and prove unrelated skill changes do not select the
new test.

**Verify**: `pnpm run test:optimizexp` and the policy test exit 0.

### Step 4: Synchronize documentation and mirrors

Document the canonical runner boundary, transport-only adapter contract, test
entrypoint, and supported host matrix. Keep both skill trees byte-identical.

**Verify**: all command-table commands exit 0.

## Test plan

Cover each host against the same fake canonical runner events: init, running,
feedback correction required, report-only, candidate remaining, equilibrium,
assert failure, and successful mark. Cover relevant-check selection for both
mirrors and ensure package changes did not alter dependencies.

## Done criteria

- [ ] No host adapter owns a separate stop predicate or writes scope directly.
- [ ] Grok cannot return success after a host guard or harm-floor terminal.
- [ ] Every host propagates canonical non-terminal and failure states.
- [ ] `pnpm run test:optimizexp` runs all skill contract tests and passes.
- [ ] Relevant skill changes select mirror and OptimizeXP tests.
- [ ] Standards, mirrors, focused tests, staged checks before each commit, and
      final base-scoped gate pass.
- [ ] `pnpm-lock.yaml` and live OptimizeXP/product artifacts are untouched.

## STOP conditions

- A host runtime cannot invoke the canonical TypeScript runner and no tested
  fail-closed transport is available.
- Plans 001-004 are incomplete or their schemas are still moving.
- Relevant-check integration would require a dependency/lockfile change.

## Maintenance notes

Host adapters should remain boring. New hosts get the conformance fixtures
first, then the thinnest transport wrapper; lifecycle semantics stay in one
runner.
