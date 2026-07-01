# Stale PR cleanup

## Loop

Recurring maintenance on the HoBo GitHub repo: open PRs that sat >24h without merge, or draft PRs with green CI waiting on human action.

## Trigger

**Event** — scheduled daily scan **or** manual `/stale-pr-cleanup` invocation.

Scan criteria:
- `gh pr list --state open` where `now - createdAt > 24h`
- include draft PRs with `mergeable: MERGEABLE` and CI `SUCCESS` regardless of age

## Steps

### 1. Triage (autonomous)

For each open PR, classify:

| Class | Signals | Action |
|---|---|---|
| **Ready** | mergeable, CI green, work complete | rebase on `main`, validate, mark ready, squash merge |
| **Superseded** | conflicts + same intent already on `main` (e.g. duplicate pnpm migration) | zero-out branch |
| **Needs work** | mergeable but failing checks or incomplete acceptance | own branch, fix, validate, merge |
| **Blocked** | conflicts + unique unmerged work | rebase, resolve conflicts, validate, merge |

Priority: **Ready** and **Superseded** first (fast wins).

### 2. Own (autonomous)

Pick highest-priority PR. Checkout head branch, rebase on `origin/main`.

### 3. Review & optimize (autonomous)

- Read changed scope only
- Run `pnpm agent:check -- --base=origin/main`
- Apply minimal fixes; no scope creep
- Squash to one commit if multiple

### 4. Push & wait for CI (autonomous)

```bash
git push -u origin <branch> --force-with-lease
```

Poll until `docs` and `PR impact gate` are `SUCCESS`.

### 5. Merge or zero-out (autonomous)

**Ready / Needs work / Blocked (resolved):**
```bash
gh pr ready <n>
gh pr merge <n> --squash --subject "<conventional commit>" --body "Closes HOBO-N"
```

**Superseded:**
```bash
git push origin $(git rev-parse origin/main):refs/heads/<head-branch> --force
```
GitHub auto-closes when head equals base (0 commits, 0 diff).

If `gh pr close` is permitted, close with comment instead.

### 6. Update Linear (autonomous)

For each merged PR linked to `HOBO-N`:
- Confirm issue status is **Done** (set if still open and acceptance met)
- `save_comment` with PR URL, merge SHA, proof paths, test count

### 7. Repeat until `gh pr list --state open` is empty

## Checkpoint

**None** for Ready/Superseded/Blocked-with-clear-resolution.

**Brief required** when:
- PR has unique unmerged work AND conflicts cannot be auto-resolved without dropping commits
- CI fails after two fix attempts
- merge would delete or regress `main` content

### Brief format

```
## Stale PR cleanup — decision needed

**PR:** #N — <title>
**Class:** Blocked
**Conflict:** <files or areas>
**Options:**
1. Take main (drop PR commits) — recommended if superseded
2. Take PR (keep branch work) — recommended if main is missing it
3. Manual merge — both sides have unique commits

**Agent recommendation:** <option> because <reason>
**Link:** <PR URL>
```

Push brief as PR comment if permitted; otherwise stop and report.

## Push right

Defer human involvement until step 5 fails or step 7 completes with zero open PRs. Agent runs full validate + merge before any checkpoint.

## Definition of done

- `gh pr list --state open` returns empty
- Every merged PR has Linear comment with SHA + proof paths
- No failing `agent:check` on merged work
- Superseded PRs closed (zero-out or explicit close)

## Out of scope

- Creating new feature work unrelated to open PRs
- Chasing pre-existing `main` test/doc failures unrelated to PR diff
- Force-merging with red CI
- Closing PRs that have unique unmerged commits without triage
