# 09 — Timetable

**Thesis:** Operations run on rails — the departures board. Punctuality is the promise; every delay explains itself.

## Philosophy

A railway departures board is the most trusted operational interface ever shipped: strangers bet their day on it without reading a manual. It earns that trust with two moves HoBo wants for its control plane. First, **schedule as contract** — a departure time is a promise, and the board's whole visual system exists to report whether the promise is being kept. Second, **no silent failure** — when a train is late, the board says so in red and says why. This mockup transplants that contract onto release operations at Junction ACME: every deploy, rollback, drift reconciliation, and secret rotation is a departure with a TIME, a FROM, a TO (the platform is a Camp), a CHANNEL, and a STATUS. The append-only event log is the timetable archive: every departure replayable. The Swiss International Typographic Style is not decoration here — it *is* the argument. Müller-Brockmann's grid, Helvetica's neutrality, and the SBB clock's single red hand all say the same thing: the system is objective, the system is on time, and when it isn't, it tells you in one color.

## Design principles

1. **Punctuality is the interface.** The dominant reading axis is the TIME column — 40px bold tabular numerals. Everything else is subordinate detail about what the time-promise refers to.
2. **Every delay explains itself.** DELAYED is the only red text on the board, and it is never alone: the cause travels with it in the same cell ("gate: security review — awaiting Morgan"). No red without a reason.
3. **The grid is the authority.** Six flush-left columns, one shared gutter (28px), horizontal hairlines only. Alignment does the work borders would do; there are no boxes anywhere.
4. **Two weights, five sizes, one accent.** Regular and bold Helvetica; 12/16/24/40/88; black on white with SBB red reserved for the second hand and DELAYED. Restraint is the brand.
5. **Operations vocabulary, not train vocabulary.** FROM→TO maps to plan→policy gates→deploy, staging→production, production→rollback. The metaphor is carried by structure, never by illustration.

## Design system

### Palette

| Token | Hex | Role |
|---|---|---|
| `--white` | `#FFFFFF` | Ground; clock face |
| `--ink` | `#0A0A0A` | All primary text, clock hands, section rules |
| `--red` | `#EB0000` | SBB red — DELAYED status and the clock's second hand only |
| `--gray` | `#6E6E6E` | Secondary voice: versions, camps, causes, crew attributions, column labels |
| `--hairline` | `#DDDDDD` | 1px horizontal row separators — the only lines besides the two 2px section rules |

### Type scale (Helvetica/Arial, regular + bold only)

| Token | Size | Use |
|---|---|---|
| `--size-xl` | 88px | Masthead "DEPARTURES — JUNCTION ACME" (bold, −2px tracking, 0.92 leading) |
| `--size-l` | 40px | Departure times (bold, tabular numerals) |
| `--size-m` | 24px | Reserved step (unused on this board; kept in scale) |
| `--size-s` | 16px | Row content, statuses, service notices |
| `--size-xs` | 12px | Column labels, channels, causes, meta line (letterspaced caps) |

`font-variant-numeric: tabular-nums` on the body so every time, version, and percentage sits in the same rhythm.

### Spacing

| Token | Value | Role |
|---|---|---|
| `--margin` | 56px | Page left/right margin |
| `--gutter` | 28px | Single column gutter, identical between all six columns |
| `--cols` | 120 / 380 / 130 / 340 / 120 / 1fr | TIME · RELEASE · FROM · TO—PLATFORM · CHANNEL · STATUS |
| Row baseline | 11px from top hairline | Every row's first baseline sits the same distance below its hairline |

### Components

- **Masthead** — 88px title flush left; 12px letterspaced gray meta line (event log · replayability · plan → policy gates → deploy · board time).
- **Station clock** — inline SVG, 200px: white face, black minute/hour ticks and hands, red second hand with disc tip. The only image on the page.
- **Board** — column-label row under a 2px ink rule; ten departure rows separated by 1px hairlines; `align-items: baseline` so 40px times and 16px text share a baseline.
- **Status cell** — bold caps; optional 12px gray cause line beneath (`gate: …`), mandatory for DELAYED.
- **Service notices** — label + 2px rule, three terse crew-signed lines.

## Look & feel

White page, black letters, one red word. The masthead shouts at 88px, the times insist at 40px, and everything else recedes to 16px and 12px — the scale contrast of a station hall read from thirty meters. Ten rows of harbor-crm traffic move from staging to production across camps on Hetzner, Cloudflare, Fly, AWS, Vercel, and a wasmCloud yard. The eye falls down the TIME column, catches the single red DELAYED, and finds the reason attached: a security gate awaiting Morgan. The SBB clock at top right — second hand frozen mid-sweep in the same red — implies the board is live and the minute will click over. Nothing is decorated; everything is aligned.

## Ideation log

1. **Split-flap skeuomorphism** (dark board, amber/yellow flap cells, per-character tiles) — rejected: tiles are boxes, the yellow is a second accent, and the nostalgia reads as theme-park rather than Swiss objectivity. Forbidden on three counts and weaker on message.
2. **Full A→B journey diagram per row** (staging ─→ gates ─→ canary ─→ production as a horizontal stepper with nodes) — rejected: node glyphs become icons, connectors become rules, and the board stops being a timetable and starts being 03 Mission Control. The FROM/TO columns carry the same information with zero ink.
3. **Platform-first grouping** (rows clustered under camp headings, like station platforms 1–6) — rejected: it fragments the single time axis into six short lists and kills the one thing a departures board does best — a strict chronological promise sequence. Camp stays as a gray annotation inside TO.
4. **Red used for the whole delayed row** (time, release, and status all in `#EB0000`) — rejected against the spec's own discipline: "DELAYED in SBB red, everything else black." Flooding the row dilutes the alarm; one red phrase plus its cause is louder.

## Hardening notes

- **Pass 1 (v1 → v2):** v1 overflowed the 1000px frame — the 15:45 row and the entire SERVICE NOTICES strip were clipped. "BOARDING — CANARY 25%" wrapped to two lines, breaking the row rhythm; the delayed row's *time* was red, violating "everything else black." Fixes: compressed the masthead meta to one line, rebalanced columns (STATUS widened to ~250px with `white-space: nowrap`), moved rows to equal flex heights, un-reddened the time.
- **Pass 2 (v2 → v3):** rows with cause sub-lines were vertically centered, so their main baselines floated higher than neighboring rows — the hairline-to-baseline distance was irregular, i.e. minimal but not disciplined. Fix: `align-content: start` with a fixed 11px hairline-to-content offset so every row's first baseline is identical.
- **Pass 3 (v3 → v4):** the baseline fix re-introduced a bottom overflow — 15:45 collided with SERVICE NOTICES. Fix: retuned the vertical budget (page padding 36/32 → 28/28, board and notices margins 24/22 → 16/16, row offset 14 → 11px) so ten rows, both 2px rules, and three notices sit inside 1600×1000 with even slack. Lint: PASS (13 tokens, 1 font stack).

## Distinctiveness check

- **01 Terrain (cartographic map):** Timetable has no geography and no contour — space is a six-column text grid, not a landscape.
- **02 Broadsheet (newspaper edition):** Broadsheet narrates in ragged editorial columns; Timetable states rows against a clock — schedule, not story.
- **03 Mission Control (launch console):** Mission Control is dense dark-room telemetry; Timetable is white-page public signage with exactly one number size that matters.
- **04 Quiet Garden (calm ambient):** Quiet Garden soothes by withholding; Timetable promises by declaring — hard times, hard statuses, one hard red.
- **05 Conversation (Crew dialogue):** Conversation is turn-taking prose with the Crew; here the Crew only signs three terse notices under a departures grid.
- **06 Brutalist Terminal (text-file honesty):** Terminal is monospace stream honesty; Timetable is proportional Helvetica on a strict modular grid — typographic order, not raw output.
- **07 Organism (living cells):** Organism breathes with rounded biological form; Timetable has no curve except the clock face.
- **08 Metropolis (isometric city):** Metropolis renders infrastructure as 3D volume; Timetable flattens it to two dimensions of time and destination.
- **10 Patchbay (hardware rack):** Patchbay is tactile jacks-and-cables spatial wiring; Timetable is pure schedule — nothing to touch, only a promise to keep.
