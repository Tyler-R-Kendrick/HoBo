# 06 — Brutalist Terminal

**Thesis: a control plane is a TEXT FILE — total disclosure, zero decoration. The anti-dashboard.**

## Philosophy

Every hosting dashboard lies a little: rounded cards hide columns, "health scores" compress twelve facts into one green dot, and the thing that will actually run when you press the button is hidden behind a spinner. This exploration refuses all of it. The Camp inventory for `camp:fsn1` is one table — every resource, every state, every seq number, in one glance, with 1px black rules doing all the work. The only "chrome" is the material itself: black ink on white paper, a yellow selection bar, red for the two facts that are actually wrong, and classic `#0000EE` underlines for anything that jumps into the append-only log. The command palette is the moral center: before anything runs, HoBo prints *exactly* what will run — resolved plan steps, the gate that is still `PENDING (morgan)`, the camps that will be touched — under a black bar that says "PLAN IS A PREVIEW — NOTHING HAS RUN." Honesty as aesthetics; disclosure as decoration.

## Design principles

1. **Total disclosure, one surface.** All 14 resources, both drifts, the log tail, and the pending plan are visible simultaneously. Nothing is behind a tab, a hover, or a collapsed card.
2. **Ink is the only ornament.** 1px solid black on every cell, 3px rules between regions, a hard 6px offset block under the palette. Zero radius, zero blur, zero gradient, zero icon — glyphs are typographic (`▸ ✓ × →`).
3. **Color is a signal, never a mood.** Six tokens total. Red appears exactly where reality diverges from plan (2 drifted rows + drift events). Yellow appears exactly where the cursor is (1 table row, 1 completion row). Blue means "this text jumps into the event log."
4. **Consequence before action.** The palette's completion list *is* the resolved plan: cached build skipped, conformance evidence with run seq, gates with owner and status, affected camps, and the enter-key contract ("blocked until gate 3 clears").
5. **The view is a fold over the log.** Every row's LAST EVENT carries a linked seq#; the header states the fold point (`event log seq #48211`); the tail proves the table by showing the raw material it was computed from.

## Design system

### Palette

| Token | Hex | Role |
|---|---|---|
| `--white` | `#FFFFFF` | Paper. The only background |
| `--black` | `#000000` | Ink: text, all borders, header/footer bands, palette shadow block |
| `--link` | `#0000EE` | Classic hyperlink blue, always underlined — event seq numbers, run refs |
| `--sel` | `#FFFF00` | Cursor: selected table row, selected palette completion |
| `--gray` | `#767676` | De-emphasis: timestamps, parentheticals, hint text (4.54:1 on white) |
| `--red` | `#CC0000` | Drift and pending gates only — sparse by law (5.9:1 on white) |

### Type scale (one mono stack: `ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`)

| Size | Use |
|---|---|
| 22px / 700 | Scope path `junction:acme / yard:hetzner / camp:fsn1` — the ONE large size |
| 15px / 700 | Palette input line |
| 13px | Body: table cells, log tail, counts |
| 12px / uppercase / +1px tracking | Table header band, palette bar, header stamp |
| 11px / uppercase | Palette section label ("WILL RUN — PLAN#1932 …") |

### Spacing & structure

| Token / rule | Value |
|---|---|
| Cell padding | 9px × 10px |
| Region separators | 3px solid black (header, tail, footer) |
| Cell borders | 1px solid black, `border-collapse: collapse` |
| Palette lift | `box-shadow: 6px 6px 0 0 black` — hard offset block, zero blur |
| Page margins | 24px gutters; table runs full-bleed 1600px |

### Components

- **Inventory table** — fixed-layout 7 columns (KIND / NAME / STATE / VERSION / DRIFT / LAST EVENT / OWNER); header row black bg, white uppercase text; drift column uses `✓` / `×` prefixes; owners mix humans (sarah, priya, morgan) and crew agents (`crew:sre`, `crew:gitops`, `crew:endpoint-monitor`, `crew:platform-eng`).
- **Command palette** — black title bar (`COMMAND` / "PLAN IS A PREVIEW — NOTHING HAS RUN"), bold input with block caret, numbered completion rows separated by 1px rules, meta row (affected camps), gray action contract row.
- **Event log tail** — 12 raw entries, columnar `seq / time / type / subject / detail`, drift events in red, seq numbers linked.
- **Key hint bar** — inverted black band: `[j/k] row · [enter] inspect · [:] command · [d] diff · [r] replay events · [?] help`.

## Look & feel

White paper, black ink, hairline grid everywhere — closer to a Berlin type specimen or a 1970s timetable proof than a SaaS dashboard. The yellow cursor bar and the floating black-shadowed palette are the only two things that "sit above" the page, and both are flat rectangles. Reading order is enforced by weight alone: 22px path → black table header band → red drift rows → palette → log tail → inverted hint bar. Everything is text; everything text is selectable, greppable, honest.

## Ideation log (alternatives considered & rejected)

1. **Dark phosphor terminal (green/amber on black).** Rejected: forbidden by the loop (no dark background), and it romanticizes terminals instead of taking their honesty seriously. Ink-on-paper brutalism is harsher and more legible at 4.5:1+.
2. **ASCII box-drawing borders (`┌─┬─┐`) instead of CSS 1px rules.** Prototyped mentally, rejected: box-drawing characters vary per font, misalign at cell boundaries with proportional padding, and read as cosplay. Real 1px borders are the same statement, made structurally.
3. **Palette as a docked bottom pane (no overlay).** Rejected: a docked pane makes the plan preview look like just another log region. Floating it over the table center — with a hard 6px black block for lift — makes "you are about to act" interrupt "you are reading state," which is the correct interruption.
4. **Single mega-table merging inventory + events into one stream.** Rejected: inventory is a *fold* of the log, not the log; collapsing them destroys the thesis. Instead the tail sits below as raw material with seq links stitching the two together.
5. **Per-column color coding (state green, version blue…).** Rejected instantly: six tokens, and green does not exist here. `✓`/`×` glyphs plus red-only-for-drift carry the same information with more discipline.

## Hardening notes (critique passes)

- **Pass 1 → 2:** v1 left a ~250px white void between the log tail and the hint bar (dead space = dishonest framing) and the header felt like an unstyled default rather than a composed specimen. Fixes: cell padding 7→9px, extended the tail with real events (`conformance.pass`, `gate.requested`, `plan.created`, `ref.resolved` "value never entered the log"), added a right-aligned uppercase stamp block ("HOBO CONTROL PLANE — THIS VIEW IS A TEXT FILE / fold of the log as of …").
- **Pass 2 → 3:** the new stamp wrapped to a three-line orphan ("…GATES") and pushed the counts line to wrap; the extended tail overflowed and clipped a log line mid-glyph at the bottom edge — cropped text in a total-disclosure design is self-refuting. Fixes: `white-space: nowrap` on stamp and counts, stamp copy shortened to two lines, tail trimmed to entries that aren't already the table's LAST EVENT column.
- **Pass 3 → 4 (final):** ~36px of slack remained above the hint bar; restored one tail entry (`#48122 stream.lag=0`) so the last line sits one line-height above the footer band. Full-bleed, no clip, lint PASS (11 tokens, 1 font stack, 0 hex literals outside `:root`).

## Distinctiveness check

- **01 Terrain** — no cartography, no elevation metaphor: space here is a grid of cells, not a map; position encodes nothing.
- **02 Broadsheet** — no editorial voice, headlines, or column inches: this is a table proof, not a newspaper; hierarchy comes from rules, not typography families.
- **03 Mission Control** — no launch drama, gauges, or big-number tiles: state is a lowercase word in a bordered cell.
- **04 Quiet Garden** — the exact opposite of calm ambience: maximum density, hard edges, zero whitespace luxury, interruption by overlay.
- **05 Conversation** — no dialogue with Crew agents: agents appear only as owner strings in a column; the interface is declarative text, not chat.
- **07 Organism** — nothing lives, breathes, or animates: cells are table cells, not biological ones; drift is a red `×`, not a symptom.
- **08 Metropolis** — flat as paper: no isometry, no depth illusion beyond one hard shadow block, no spatial city metaphor.
- **09 Timetable** — shares Swiss discipline but rejects its polish: no flip-board rhythm or departures poetry — this is the unkerned raw proof, with an interactive palette a departures board could never have.
- **10 Patchbay** — no hardware skeuomorphism, jacks, or cables: connections are `→` arrows inside plain text (`postgres-dsn → vault:kv/crm/db`).
