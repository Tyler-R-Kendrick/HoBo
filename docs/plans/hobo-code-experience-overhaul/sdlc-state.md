# SDLC state — hobo-code experience overhaul

**phase:** in progress
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

## Remaining

- Runs linter CLI (`optimizexp:lint-runs`): verify pareto-equilibrium claims
  against committed minimal evidence bundles (scores chain + sha-matched
  evidence); wire as an `optimizexp:check` lane.
- Re-certify hobo-code on the rebuilt shell with a real TTY recording.

## Residual (backlog)

- SGR mouse hit regions; Warning budget filter (carried from
  `hobo-code-interactive-shell`).
- Engine `/cost` per-turn token usage surfacing.
- Independent second-agent evidence reviewer (explicitly deselected for this
  overhaul).
