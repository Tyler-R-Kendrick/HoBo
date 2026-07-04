# 03 · Mission Control

**Thesis: every deploy is a LAUNCH.**

Deploy-in-progress console for the `harbor-crm` bindle rolling v2.4.1 → v2.5.0 across the
production Camp fleet (hetzner-fsn1 canary live, cloudflare-edge and fly-ams holding),
rendered as a NASA-style flight-control room.

## Philosophy

A production deploy is the highest-stakes moment a control plane ever hosts, and most tools
render it as a progress bar with a spinner. Mission Control takes the opposite position:
borrow the visual discipline of a launch console, where every decision-maker is a *station*,
every threshold is a *flight rule* written down before ignition, and the master clock — not
the scroll position — is the organizing axis of the whole room. HoBo's append-only event log
makes the metaphor honest rather than cosmetic: the countdown clock is literally elapsed time
since the plan was committed at seq 18,204, and ABORT is not a kill switch but a *replay* of
the log back to that sequence number. The room exists to answer one question at a glance:
**are we still GO?**

## Design principles

1. **One clock rules the room.** Every timestamp on screen is mission-elapsed time (`T+`),
   from the 56px master clock to each ticker row to the flight-rule sustain windows. Wall
   time (UTC) appears exactly once, in the header, as a courtesy.
2. **A verdict is a lamp, not a paragraph.** The GO/NO-GO board gives each policy gate and
   Crew agent a physical station with a square status lamp, a one-word verdict, and a
   one-line justification. Five GO and one POLLING is readable across the room.
3. **Thresholds are drawn before the data crosses them.** Every telemetry strip carries its
   red abort line and grey reference line in the plot itself, and the same numbers reappear
   verbatim in the flight-rules footnote. Nothing about auto-abort is discretionary or hidden.
4. **Destructive controls have physical friction.** HOLD is a plain amber-framed control;
   ABORT is hazard-striped, guarded, and demands a confirm phrase ("ABORT D-2481"). They are
   impossible to confuse at any distance.
5. **The log is the truth.** The bottom ticker is styled as the append-only event log it
   actually is — sequence-numbered, replayable, and the source of both the clock and the
   rollback target.

## Design system

### Palette

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0A0E12` | room background |
| `--panel` | `#10161D` | panel surface |
| `--panel-deep` | `#0C1117` | inset cards (stations, camps, strips) |
| `--grid` | `#1B242E` | gridlines, borders, chart rules |
| `--green` | `#37FF8B` | phosphor: GO, nominal, active phase, mission clock |
| `--amber` | `#FFB020` | caution: POLLING, HOLDING camps, HOLD control |
| `--red` | `#FF4545` | abort lines, flight rules, ABORT control |
| `--cyan` | `#39C6D6` | telemetry traces and current values |
| `--text` | `#C8D3DC` | primary text (≥ 4.5:1 on `--panel`) |
| `--text-dim` | `#8FA1AF` | secondary labels (≥ 4.5:1 on `--panel-deep`) |

### Type scale

| Use | Face | Size |
|---|---|---|
| Mission clock | mono 700 | 56px + phosphor glow |
| Station verdicts (GO/POLLING) | mono 700 | 17px |
| Telemetry current values | mono 700 | 18px |
| Panel labels / phase names | condensed sans, uppercase, +.14–.18em tracking | 10–13px |
| Body data, ticker rows | mono | 11–12px |
| Footnotes, station rationale | mono | 9.5–10.5px |

Two font stacks only: `--font-mono` (IBM Plex Mono → Consolas → monospace) for all data,
`--font-sans` (Arial Narrow condensed) for uppercase headers. No serif anywhere.

### Spacing & structure

- Fixed 1600×1000 frame; 14px outer gutter and inter-panel gap (`--pad`).
- Two-column grid: 1148px operations column, 406px decision column.
- Left rows: clock+sequence 158px · GO/NO-GO 196px · telemetry 240px · event log fills.
- Sharp 1px borders everywhere; **zero border-radius** (flight hardware, not a web app).

### Components

- **Phase rail** — five bordered phase blocks joined by `▶` connectors; completed phases lit
  green-on-dim, active phase glowing green inset with a 25%-filled traffic bar, pending grey.
- **Station card** — station code (`STN-05 · CREW AGENT`), name, controller, rationale line,
  then lamp + verdict word; verdict color repeated in a 2px bottom rule.
- **Telemetry strip** — label + big cyan value, stretched SVG sparkline with grid rules,
  dashed red abort line, dotted grey reference line, live-point dot; footer restates
  `ABORT >` threshold, reference value, and NOMINAL state.
- **Camp card** — camp name + bordered status chip (CANARY LIVE / HOLDING), yard/provider
  line, pinned version and live numbers.
- **Guarded control** — HOLD (amber frame, pause glyph) vs ABORT (red frame, 45° hazard
  stripes, guard instruction line).
- **Ticker row** — `T+` timestamp · uppercase source · message · right-aligned verdict tag,
  with a 2px severity edge.

## Look & feel

Black-green CRT console under a 3px scanline overlay (kept below 10% opacity so legibility
never suffers). The only glow in the room belongs to the mission clock and the status lamps —
phosphor is spent on state, not decoration. Density is deliberately high: an operator scans
clock → board → strips in under a second, and everything else holds still. Red appears only
where abort semantics live, so any new red pixel is an event.

## Ideation log

1. **Vertical countdown spine** — a single T-minus/T-plus timeline running down the left edge
   with events pinned to it. Rejected: it privileged history over *current state*; the
   GO/NO-GO verdict ended up below the fold, which is backwards for a live console.
2. **Full-screen big-board (single wall display)** — one giant clock over a two-row lamp
   grid, no telemetry detail. Rejected: gorgeous from six meters, useless at a desk; the
   canary decision needs the actual p95/error traces with thresholds, not just lamps.
3. **Radar/orbital plot centerpiece** — camps as orbiting nodes around the bindle with
   traffic-split arcs. Rejected: overlaps loop 01 Terrain's spatial-map territory and turns
   the 25%-traffic fact into an ornament; a phase rail states it more precisely.
4. **Chat-style Crew feed for the right column** — Crew agents reporting conversationally.
   Rejected outright: chat elements are on the forbidden list (that's loop 05's thesis), and
   flight controllers answer polls with GO/NO-GO, not paragraphs.

## Hardening notes

- **Pass 1 → 2:** Killed ~180px of dead space under the flight rules by adding the upcoming
  milestones schedule (T+06:00 / T+11:00 / T+18:00); made sparkline SVGs stretch to fill
  their strips (footers had been floating above an empty band); added the missing `▶`
  connectors so the rail actually reads PLAN → GATES → CANARY → ROLLOUT → VERIFY; fixed a
  wrong short-form timestamp (`@ T+06:00` inside the active phase) and gave the mission
  clock a hold-point progress bar with a −00:01:28 countdown to the 50% decision.
- **Pass 2 → 3:** Two extra event rows plus looser row padding pushed the T+00:00:00 LAUNCH
  commit row off the panel edge — clipping the single most important log line. Dropped the
  redundant CONFORMANCE row (already on the board), restored 3px row padding; all 11 rows
  now land inside the panel with the countdown rendered amber for urgency. Re-shot: no
  clipping, no dead space, lint PASS.

## Distinctiveness check

- **01 Terrain** — Terrain is cartographic space (where things run); Mission Control is
  chronological time (one clock, one launch, no map).
- **02 Broadsheet** — Broadsheet is retrospective editorial prose on newsprint; this is a
  live black-phosphor console where the story is still being decided.
- **04 Quiet Garden** — Quiet Garden minimizes urgency; Mission Control manufactures
  disciplined urgency with countdowns, lamps, and abort lines.
- **05 Conversation** — Conversation is Crew dialogue in natural language; here Crew agents
  are silent stations that answer polls with exactly one word.
- **06 Brutalist Terminal** — the Terminal is an undesigned text file; Mission Control is a
  heavily art-directed instrument panel with lamps, rails, and guarded switches.
- **07 Organism** — Organism renders the platform as living cells that grow; this renders
  one discrete irreversible event with a hard go/no-go gate.
- **08 Metropolis** — Metropolis is isometric architecture of the steady state; this is the
  four-and-a-half minutes where the steady state is deliberately broken.
- **09 Timetable** — Timetable rows are many departures of equal weight; Mission Control is
  one departure given the entire room.
- **10 Patchbay** — Patchbay is spatial signal routing between jacks; this is temporal
  sequencing through phases — cables versus countdowns.
