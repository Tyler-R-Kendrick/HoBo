# 10 · Patchbay — hardware you can touch

**Thesis:** wiring resources should feel like patching a modular synth: physical, legible, reversible. This loop renders HoBo's resource-wiring editor (the authoring surface for a Bindle's service↔resource bindings) as a 19" hardware rack. Every binding in `harbor-crm` is a patch cable you could grab; every risky action sits behind a guard you must flip.

## Philosophy

Cloud consoles hide wiring inside YAML and dropdowns; the cost is that nobody can *see* the topology, and nobody trusts their hands. A patchbay inverts that. A cable either connects two jacks or it does not — there is no half-wired state you can't see. Pulling a cable is exactly as visible as inserting one, which is what makes it reversible: the append-only event log is the tape reel, and the REPLAY transport scrubs it. The unwired jack is the design's moral center: an amber pulsing socket that says "unwired — plan blocked", and the master ARM switch physically refuses until it's patched. Policy gates aren't a modal dialog; they're LEDs on the master strip. HoBo's plan → policy gates → deploy pipeline becomes muscle memory: patch, check the gate LEDs, flip the guard, arm.

## Design principles

1. **One binding = one cable.** Every service→resource edge is a single colored bezier with sag, a plug at both ends, and a hanging tag carrying its secretless ref or conformance result. Nothing connects invisibly.
2. **State is emitted light, not text.** Green LED = running/wired, amber LED = attention/unwired, VU needle = live load. Text only annotates what the hardware already shows.
3. **Dangerous actions have physical friction.** "Apply plan" is a power/arm toggle inside a red safety-guard outline; while a port is unwired the LCD verdict reads HOLD and the guard LED burns amber.
4. **Everything replayable, everything replay-shaped.** The event log is a tape transport (⏮ ⏪ ▶ ⏸ caps + scrub ribbon at seq #48,211); drift reconciliation and log tail render on LCDs, because history is a first-class instrument.
5. **Engrave, don't decorate.** All lettering is letter-spaced small caps at hardware sizes (6.5–13px), inset-shadowed like panel engraving; provider identity is a screwed-on badge plate, not a logo.

## Design system

### Palette

| Token | Hex | Role |
|---|---|---|
| `--charcoal` | `#23262B` | room/case background |
| `--panel` / `--panel-hi` / `--panel-lo` | `#2B2F35` / `#3A3F47` / `#1F2226` | brushed module faceplates (gradient stops) |
| `--rail` / `--rail-lo` | `#1A1D21` / `#141619` | dark patch-field rail, recessed readouts |
| `--cream` / `--cream-dim` | `#E8E4D8` / `#B9B4A4` | engraved labels, plates, tags (≥4.5:1 on charcoal) |
| `--led-green` / `--led-green-dk` | `#52D273` / `#1C7A3D` | healthy/wired LEDs |
| `--amber` / `--amber-dk` | `#E8B14E` / `#8A6420` | attention, unwired pulse, HOLD |
| `--cable-red` | `#F25C54` | pg:// cables |
| `--cable-yel` | `#F4D35E` | queue:// cables |
| `--cable-teal` | `#43AA8B` | secret:// + blob:// cables |
| `--cable-blue` | `#577590` | http:// cables |
| `--metal-hi/md/lo` | `#A6ACB4` / `#6E747D` / `#3E434A` | screws, jack rings, fader caps, rack rails |
| `--lcd` / `--lcd-bg` | `#8FE7A2` / `#101812` | phosphor LCD text/glass |
| `--danger` | `#E06C5E` | safety-guard outline, wiring failure |

### Type scale (instrument engraving)

| Size | Use |
|---|---|
| 15px caps, .22em tracking | rack title plate |
| 13px caps plate | module name plates (API, POSTGRES-16) |
| 9.5–10.5px | breadcrumb, LCD plan readout (mono) |
| 8–8.5px | jack labels, readout metrics (mono), cable tags |
| 6.5–7.5px | port LEDs, tick captions, foot engravings |

Two families total: `"Trebuchet MS", Verdana, Geneva, sans-serif` for engraving; `Consolas, Menlo, "DejaVu Sans Mono"` for LCD/refs.

### Spacing / structure

- 1600×1000 case = CSS grid: `26px rail · 1164px modules · 340px master · 26px rail`; rows `62 · 280 · 318 · 296`.
- 8px rack gap between modules; 10px case padding; modules are flex columns so port-LED strips and vent grilles seat against the bottom edge.
- Patch field is one 1164×318 inline SVG; jack pitch 90–110px, service row cy=48, resource row cy=262.

### Components

- **Module faceplate** — brushed gradient + 1px hairline stripes, 4 corner screws (radial-gradient, rotated slots), inset top highlight/bottom shadow.
- **Knob** — SVG: tick arc (0–8), ridged rim (dashed stroke), radial-gradient cap, cream pointer; replicas per service.
- **Fader** — recessed slot, metal cap with grip line, side tick marks; memory per service.
- **1/4" jack** — nut ring (radial metal gradient), recessed hole, specular arc highlight; wired jacks get a colored plug tip + sleeve + boot.
- **Patch cable** — 3 strokes per path (drop shadow, 7px body, offset highlight), cubic bezier with sag; hanging traffolyte tag near the source plug.
- **Meters** — cream-faced VU with needle + red zone (Postgres conn 41/80), LED column (queue depth 1.2k/5k), capacity bar (blob 212/500 GiB).
- **Master strip** — plan LCD, transport caps with SVG glyphs, scrub ribbon with event markers, policy-gate + crew LED banks, drift + log-tail LCDs, guarded ARM toggle.

## Look & feel

Photographed studio gear, not a dashboard: a charcoal rack under a soft top light (radial vignette), cream engraving, phosphor-green LCDs, and eight fat cables sagging across a near-black patch field. Depth comes exclusively from inset/outset shadows and gradient metals — deliberately skeuomorphic. The scene tells one story at a glance: harbor-crm is healthy (green LEDs, VU mid-scale), but WORKER's `blob://media` socket pulses amber and the whole apply chain — port LED, gate LED, LCD verdict, guard lamp — agrees: HOLD until Marcus patches one cable.

## Ideation log — alternatives considered & rejected

1. **Node-graph editor (React-Flow style boxes + orthogonal edges).** Rejected: it's the default idiom of every IaC visualizer; edges without sag/plugs read as abstract data flow, not touchable wiring, and it would violate the loop's anti-flat mandate.
2. **Vertical Eurorack columns (one skinny module per service, cables running horizontally).** Rejected: harbor-crm's 3-service × 3-resource shape wastes a portrait format at 1600×1000; horizontal cable runs crossed the module labels and killed legibility of source→dest.
3. **Cables drawn module-to-module directly (no patch field).** Rejected: cables crossing over faceplates obscured knobs/meters and made endpoints ambiguous; a dedicated dark rail (SERVICE OUT row above, RESOURCE IN row below) gives every cable a clean, readable start and end.
4. **Literal telephone-exchange patchboard (uniform grid of 40 jacks, bay letters/numbers).** Rejected: authentic but hostile — port semantics (`pg://main · rw`) beat coordinates like "B-14"; a labeled protocol jack keeps Marcus oriented without a legend.
5. **Emoji/system glyphs for transport buttons.** Rejected after v1 screenshot: they rendered as colored emoji and shattered the machined-metal illusion; replaced with drawn SVG caps.

## Hardening notes (critique passes)

- **Pass 1 → v2:** `SERVICE OUT` engraving collided with the first `pg://main` jack label — rotated rail engravings 90° onto both side cheeks. Transport glyphs rendered as emoji — redrawn as SVG icons in the button caps. Dead panel area in modules — added port-status LED strips (per-port wired state, worker BLOB amber "2/3 wired") and vent grilles. Master column gap — added policy-gates LED bank (COST/REGION/SECRETS green, WIRING amber). The two `http://public` mult jacks overlapped — re-spaced to a 38px-pitch mult pair.
- **Pass 2 → v3:** modules converted to flex columns so ports/vents seat on the bottom rail edge (no floating dead band); WORKER foot text wrapped — shortened engraving; added drift-reconciliation LCD ("desired == actual ✓ · last sweep seq #48,196") and pushed the safety guard to the bottom of the master strip; enlarged all three resource meters.
- **Pass 3 → final:** bigger meters squeezed the Postgres and Blob readout LCDs into mid-word wraps — restructured to one metric per line; vertically centered resource controls; added append-only log-tail LCD (seq #48,211…#48,102) to finish the master column. Lint: PASS (24 tokens, ≤8 loose hex, 0 external refs, ≤4 font stacks).

## Distinctiveness check

- **01 Terrain:** no cartography — space is a rack elevation, not a map; position encodes rack rows, not geography.
- **02 Broadsheet:** zero editorial typography or columns — text is 7px panel engraving, never prose.
- **03 Mission Control:** not a wall of telemetry consoles — a single authoring instrument where you *change* wiring, not just watch it.
- **04 Quiet Garden:** deliberately dense, mechanical, and amber-alarmed rather than calm and ambient.
- **05 Conversation:** no Crew dialogue surface at all — agents are four LEDs on a strip, not chat turns.
- **06 Brutalist Terminal:** maximal material illusion (gradients, shadows, metal) — the exact opposite of text-file honesty.
- **07 Organism:** nothing biological or self-arranging — rigid machined geometry, human-pulled cables.
- **08 Metropolis:** flat front-facing 2D faceplates, no isometric projection or architectural metaphor.
- **09 Timetable:** no Swiss grid of rows/columns — information hangs on cables and needles, and the only "schedule" is a tape-transport scrub ribbon.
