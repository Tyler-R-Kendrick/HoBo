# SDLC state — hobo-code experience overhaul

**phase:** closing (finish protocol)
**branch:** feat/hobo-code-experience-overhaul

Fixes the two failed experience complaints against the InteractiveShell —
garbage animation/frame-rate and an unhelpful chat loop — and upgrades the
optimizexp harness so the failure class that certified them cannot recur.

## Slice 1 — differential rendering + honest chat (landed)

- Shell driver rebuilt on `@earendil-works/pi-tui` (differential renderer as
  a library; HoBo keeps the chrome; pi packages migrated off the deprecated
  `@mariozechner` scope). Repaints only on state change; idle Bo rest spans
  request no renders; no full-screen erases; no alternate screen (transcript
  survives exit); SIGWINCH resize; event-driven quit.
- Input decoded as atomic sequences: arrows navigate the slash palette
  (`slashIndex` could previously never move), bracketed paste is one edit,
  unknown escapes no longer type garbage into the input.
- Isolation/dispatch converted from `spawnSync` to async spawn — the event
  loop no longer freezes during a turn.
- Honest replies: a dispatch turn *records a compute task* and says so; no
  success theater, no fixed filler, branding confined to `/about`; footer
  reads `engine:none · dispatch-only` until an engine runs.
- `test/render-budget.test.ts` pins the repaint economy end-to-end.

## Slice 2 — streaming engine under the shell (landed)

- `src/shell-engine.ts`: pi `AgentSession` as completion engine — never the
  product frame. Engine cwd is a mediated isolation sandbox; edits apply
  only via the audited `hobo-code promote --run <id>` gate; sandbox kept on
  exit. Streams text deltas + tool lines; Esc cancels.
- Availability gated by credentials (`shouldAttemptEngine`); every failure
  degrades to the honest dispatch-only shell with a reason on stderr.
- `HOBO_AGENT_MODEL` default corrected to a registry-real id.

## Slice 3 — optimizexp harness upgrades (landed)

- Perceptual metrics: drivers capture `timing` (durationMs,
  timeToFirstOutputMs) and `frameStats` (first output, max silent gap,
  event count, byte volume from the real asciinema cast) into `meta.json`;
  `evidenceChecks` gain `durationUnderMs` / `firstOutputUnderMs` /
  `maxSilentGapUnderMs` / `totalOutputBytesUnder`.
- Honest capture kinds: the cli driver writes `primary.txt` transcripts —
  synthetic single-event `.cast` files (how a frozen shell was certified
  "replayable") are rejected at review.
- Persona binding gates in `optimizexp:check`: scenario↔product binding
  (`productBinary` in project config; caught and repaired two hobo-code
  features that only ran pnpm scripts) and experience-catalog persona
  coverage (all 9 priority-≤10 personas now own catalog rows).
- tui-craft gained executable perceptual scenarios (reduced-motion static
  frame, idle repaint economy, no full-screen erases) bound to real step
  implementations against the product source.

## Slice 3b — run-claim audit (landed)

- `pnpm run optimizexp:lint-runs` + drift-gate lane: a run claiming
  completion must commit its minimal bundle — `summary.md`, `baseline.json`,
  `iterations/*/scores.json` (sha256-matched via `experiments/*.json`), and
  reviewable cited evidence — or be retired with `superseded.json`. The
  gitignore keeps narrative artifacts (REPLAY.html/REPLAY.md/terminal.txt)
  untracked while un-ignoring the bundle files and certified `primary.cast`
  recordings.
- The `20260801-hobo-code-optimizexp` pareto-equilibrium claim failed every
  audit axis (scores never committed; flagship TTY evidence captured on the
  non-TTY path) and is now explicitly superseded.

## Slice 3c — re-certification on real TTY recordings (landed)

- `HOBO_CODE_SHELL_MAX_MS` / `HOBO_CODE_SHELL_KEYS` make interactive paths
  capturable: a TUI claim needs a real recording, and a recording needs the
  session to end through the normal quit path rather than a kill mid-frame.
- Run `20260803-hobo-code-recert` re-captured all three
  `hobo-code-default-entry` scenarios against the rebuilt shell via the
  installed bin entry; `capture-evidence --mode validate --strict` is clean.
  The run deliberately does **not** claim completion (no persona scoring
  rounds were run), so `lint-runs` classifies it as *not claiming*.
- Measured from the real recording: first output 186 ms, max silent gap
  1054 ms, 31 KB over 6.2 s, **zero** full-screen erases, and static chrome
  written exactly once — the differential-rendering contract, observed.
- **Defect found by the capture:** the slash palette rendered only the first
  N lines, so moving the selection scrolled the `▸` marker out of view on an
  80x24 terminal. Fixed (viewport follows the selection, `1-6/17 · ↓11 more`
  indicator) with regression tests.

## Slice 2 completion — approval gate + real cost (landed)

Two Slice 2 items were still only partly built; both are now complete.

- **Mediated mutation is now an actual gate, not a hint.** After a turn that
  changes files, the shell raises a modal approval showing the blast radius
  from `git status --porcelain` of the sandbox. `y` runs the audited
  squash-only promote through the CLI path, `n`/Esc keeps the work sandboxed
  and prints how to promote later, and every other key is inert — a mutation
  cannot be triggered by a stray keystroke. No gate is raised for
  answer-only turns or tool runs that wrote nothing.
- **`/cost` and the footer report real spend.** Token counts and cost are
  read from the pi session (`getSessionStats`), reported per turn as a delta
  and per session cumulatively — never estimated. The footer keeps showing
  the configured budget until something has actually been spent.

## Measured before / after (the overhaul's headline claim, verified)

The pre-overhaul shell was rebuilt from `origin/main` and recorded under an
identical 100x30 pty for the same 5s window, so the baseline is an
observation rather than a memory:

| | before | after |
|---|---|---|
| Full-screen erases | **53** | **0** |
| Terminal bytes | 182,576 | 37,944 (4.8x less) |
| Alternate screen (destroys transcript) | yes | no |
| Synchronized output (tear-free) | no | yes |

Run `20260803-hobo-code-recert` carries these as committed scores whose
`evidenceChecks` (time-to-first-output, silent-gap, byte and transcript
budgets) re-execute against the committed recording on every
`optimizexp:check`. `lint-runs` now enforces `evidenceChecks` for **every**
run, not only completion-claiming ones — declaring a budget nobody checks
was itself a loophole.

## Rejected once, redesigned (the important part)

The first delivery was **rejected by the user**, and the criticism was right:
it repaired the render loop but kept the same chrome, so it "looked the same",
and its engine required cloud credentials, so for a user without keys it did
nothing at all. Two root causes, both mine:

1. **I never read the design contract.** `site/DESIGN.md` defines the HoBo
   Rubberhose identity — Steamboat Willie ink, Cuphead title cards, thick
   outlines, hard sticker shadows, strict B&W with rare vermillion/green, and
   the explicit rule *never flat SaaS chrome*. What shipped was precisely flat
   SaaS chrome: hairline rules and dot-separated status text. Nothing in the
   test suite could tell the difference, so nothing objected.
2. **I verified the wrong binary.** Every check ran the shell by path inside
   the agent worktree; the user's `hobo-code` symlink resolved to a different
   worktree entirely, so none of the work was reachable from the command they
   typed — which the package README itself warns about.

The redesign addresses both, and encodes them so they cannot recur silently:

- Chrome now follows the contract (title card, ink cards + sticker shadows,
  transcript owns the viewport at ~19 rows on 80x24 vs ~8, Bo on a one-line
  strap). `test/rubberhose.test.ts` fails the build on hairline rules, rainbow
  accents, geometry drift, or a shrinking content area.
- A **locally hosted SLM is the default engine** (ollama, streamed NDJSON,
  server-reported tokens, $0), with cloud as fallback and an honest
  dispatch-only mode last. The $0 path is now real rather than aspirational.

## Remaining

- A full persona-scored optimizexp *loop* (multi-round dual-regime with the
  review bus). This session scored a measured before/after but deliberately
  does not claim a pareto equilibrium — implementable findings remain.
- SGR mouse hit regions; Warning budget filter (carried backlog).
- Tool-use for the local SLM: turns are conversational today, so the approval
  gate is exercised by the cloud engine path and by tests, not yet by a small
  local model driving edits.

## Residual (backlog)

- SGR mouse hit regions; Warning budget filter (carried from
  `hobo-code-interactive-shell`).
- Independent second-agent evidence reviewer (explicitly deselected for this
  overhaul).
