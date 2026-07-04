# 02 — Broadsheet: THE HOBO LEDGER

**Thesis: Operations is JOURNALISM — the control plane is today's edition of your infrastructure.**

## Philosophy

HoBo's append-only event log already behaves like a newspaper's morgue: nothing is ever
overwritten, every claim traces to a dated entry, and yesterday's mistakes are corrected in
print rather than silently edited. This exploration takes that seriously and renders the
Junction `acme-industries` as a broadsheet front page, "printed" each morning at 05:00 UTC
from entries #88001–#88650. The overnight promotion of harbor-crm v2.5.0 is the lead story
because it *is* the biggest overnight change; drift is a Corrections box because a
reconciliation *is* the audit narrative admitting the record and reality briefly disagreed;
pending approvals are classifieds because they are small, patient, and legally binding.
Crews get bylines — the GitOps Crew files copy, the SRE Crew's comment is "Nominal." —
which frames autonomous operators as accountable correspondents, not invisible daemons.
The form imposes an editorial judgment a dashboard never makes: one lead, a hierarchy of
secondary pieces, agate for everything that only matters if you're looking for it.

## Design principles

1. **Everything printed is an entry.** Every figure, story, and notice cites event IDs or
   Plan numbers (`Plan #4182`, `events #88413–#88429`) and is replayable; the bottom folio
   line states the contract explicitly.
2. **Hierarchy by editorial judgment, not by widget size.** One lead story, three-column
   justified body with a drop cap; secondary reports get one column; the merely pending
   gets 9.5px agate. Importance is expressed in ems, not in color.
3. **Corrections, not alerts.** Drift found-and-reconciled is printed as a correction that
   preserves both states ("this ledger regrets the drift, and has replayed it") —
   accountability without panic.
4. **Ink discipline.** Two inks: black and one measured drop of red for the single most
   urgent item on the page (the 36-hour TLS expiry). If everything is red, nothing is news.
5. **Pure newspaper craft.** Vertical hairline rules between columns, horizontal rules in
   three weights (3px section, 1px text, double-rule closers), justified hyphenated serif
   body, uppercase letter-spaced section labels, ears flanking the masthead.

## Design system

### Palette

| Token | Hex | Role |
|---|---|---|
| `--newsprint` | `#FAF8F2` | Page stock; the only background |
| `--ink` | `#141414` | Headlines, body, rules, table figures |
| `--hairline` | `#C8C4BA` | Column rules, light horizontal rules, table row rules |
| `--agate` | `#55524B` | Agate/classified text, bylines, folio, table headers (≥ 4.5:1 on newsprint) |
| `--alert` | `#B3261E` | Used exactly once — the expiring TLS certificate notice |

### Type scale (single stack: `Georgia, 'Times New Roman', Times, serif`)

| Size | Use |
|---|---|
| 68px bold, −0.015em | Masthead "The HoBo Ledger" (didone feel) |
| 37px bold | Lead headline |
| 19px bold | Secondary-story headlines |
| 15px italic | Lead deck |
| 13px justified (`--body-size`) | Lead body, 3 CSS columns, drop cap, hyphenated |
| 12px justified | Secondary story bodies |
| 11px tabular | Fleet Vitals table |
| 9–10.5px (`--agate-size`, `--label-size`) | Agate notices, kickers (letter-spacing .14–.34em, uppercase), folio, footnotes |

### Spacing & rules

| Token / value | Role |
|---|---|
| `--gap: 18px` | Column gutter (flex strips and CSS-column interiors) |
| `--rule-thin: 1px` | Hairlines, text rules |
| `--rule-heavy: 3px` | Section kickers (top), masthead folio bar, `double` closers |
| Page margins 20–30px | Trim area of the 1600×1000 sheet |

### Components

- **Masthead**: ears (Fleet Weather = uptime index; Spend = cost index), motto
  ("All the State That's Fit to Replay"), folio bar between heavy/thin rules.
- **Lead package**: headline, italic deck, hairline-bounded byline, 3-column justified
  body with 56px drop cap and hairline column rules.
- **Fleet Vitals**: markets-style table — per Camp: uptime %, p95 ms, err %, $/day, Δ day —
  double-rule closer and sourcing footnote.
- **Public Notices**: agate classifieds (approvals, certificates, reconciliations, lost &
  found, decommission obituary, spot prices, meetings).
- **Corrections & Reconciliations**: 1px-bordered box; the drift audit narrative.
- **Tomorrow's Forecast**: timetable of gates and rollouts; **On This Day** almanac closer;
  **Letters** (Elena's replay-link request); event-log colophon line.

## Look & feel

Warm newsprint sheet, black ink, one drop of red. Reads top-left ear to bottom folio like
a real front page: weather (uptime) and markets (spend) in the ears, news in the middle,
agate at the edges. Dry, factual prose with newspaper wit ("The Change Advisory Board
holds no meeting today, or any day"). No cards, no rounded corners, no shadows, no icons,
no charts — hierarchy carried entirely by type size, rule weight, and column placement.

## Ideation log

- **Tabloid spread (two-page, centerfold incident diagram)** — rejected: halves the type
  scale at 1600×1000 and dilutes the front-page thesis; a broadsheet's single-sheet
  hierarchy is the point.
- **Live ticker/stop-press strip with blinking updates** — rejected: an edition is a
  snapshot of the log at press time (05:00 UTC); motion would betray the "printed record"
  metaphor and re-introduce dashboard nervousness.
- **Color-coded sections (FT-pink markets, blue sports-style vitals)** — rejected: breaks
  ink discipline and the one-red rule; status-by-color is exactly the dashboard habit this
  loop abstains from.
- **Engraved SVG illustration (harbor woodcut) under the masthead** — rejected: spends
  ~200px of a 1000px sheet on decoration while the brief demands information density;
  ears with real indices earn the space instead.
- **CSS `columns` for the whole page** — rejected: browser column balancing fights fixed
  1600×1000 trim; hand-set flex strips with explicit hairlines give newspaper-accurate
  control (lead body alone uses `columns: 3`).

## Hardening notes

- **Pass 1 (v1 → v2):** v1 read as a newspaper but had dead air — a hole above the
  Corrections box, empty feet under Tomorrow's Forecast and the Letters-less right rail.
  Filled with real content, not padding: a decommission obituary (legacy-pdf-service,
  "survived by worker"), Tenders & Spot Prices agate, a Letters box from Elena with an
  editors' reply, an On This Day almanac (harbor-crm v0.1.0, one year ago), one more
  forecast slot (Marcus replays his own promotion), and a full-width bottom folio line
  stating the replay contract.
- **Pass 2 (v2 → v3):** tightened the remaining pockets — added the "Meetings" notice to
  close the gap above Corrections, grew the masthead 64→68px to fill the title band,
  bumped Fleet Vitals to 11px with more leading so the table lands on the footer, and
  extended the table footnote with the Δ/p95 methodology line. Verified `--alert` is
  referenced exactly once and zero hex literals appear outside `:root`.

## Distinctiveness check

- **01 Terrain**: this is set type on a flat sheet — no cartography, elevation, or spatial metaphor.
- **03 Mission Control**: a morning-after printed record, not a live launch console with telemetry.
- **04 Quiet Garden**: editorial and information-dense, not calm-ambient minimalism.
- **05 Conversation**: crews file bylined copy in the third person; nothing is a chat turn.
- **06 Brutalist Terminal**: high typographic craft (justified serif, drop caps, rule weights), the opposite of raw monospace honesty.
- **07 Organism**: static ink at press time, not living cells that breathe or grow.
- **08 Metropolis**: strictly 2D column-and-rule composition; no isometry, no city.
- **09 Timetable**: narrative journalism with one small timetable inside it, not a Swiss departures grid.
- **10 Patchbay**: paper metaphor, not hardware — no racks, jacks, or signal paths.
