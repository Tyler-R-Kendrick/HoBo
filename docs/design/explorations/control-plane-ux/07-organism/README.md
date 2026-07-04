# 07 Organism — "Systems are alive"

**Thesis:** health is vitality, not status codes. The harbor-crm Bindle is rendered as a living
organism in a petri dish: services are glowing organelles, camps are translucent membranes,
event flow is vesicles moving through connective vessels, and operations telemetry is read the
way a physician reads a body — heartbeat, respiration, temperature, metabolism. Incidents are
immune responses; conformance tests are antibodies; the append-only event log is the genome
every regeneration replays from.

## Philosophy

Dashboards teach operators to scan for red rectangles. Organisms teach a different literacy:
you notice that something is *dimmer*, *inflamed*, or *breathing shallowly* long before it dies.
Because HoBo's event log makes everything replayable, failure is not a terminal state — it is
tissue damage that regenerates ("replayed 1,840 events, tissue regenerated in 74 s"). The UI's
job is to make vitality legible at a glance: glow = health, size = allocated resources,
vesicles = event flow, membranes = camp boundaries. Marcus (first-time dev) gets an instantly
intuitive body metaphor; Priya (platform engineer) still gets exact numbers (p95 84 ms, depth
214, $1.23/hr) attached to every organ.

## Design principles

1. **Nothing is rectangular.** Every container carries an asymmetric blob radius (e.g.
   `42% 58% 60% 40% / 55% 45% 40% 60%`) or generous soft corners; even the log entries are
   pills and the status dots are tiny blobs. Right angles read as machinery; this screen is tissue.
2. **Glow is the primary channel.** Health is encoded as bioluminescence (layered radial-gradient
   fill + outer box-shadow + inset shadow), not as icons or badges. The inflamed worker is coral
   and *brighter*, because inflammation is heat.
3. **Structure mirrors the scope model.** Organelles (services) sit inside membranes (camps:
   hetzner-fsn1, cloudflare-edge); the dish is the Bindle; the header lineage names the Junction
   and Yards. Containment is drawn, never listed.
4. **Vitals are physiological instruments.** Deploys are an ECG, throughput is breathing, errors
   are body temperature, cost is metabolism — each an SVG trace with one annotated event, never
   a data table.
5. **Numbers ride the metaphor, they don't replace it.** Every organic reading carries a precise
   figure: "last beat: v2.5.0, 41 min ago", "36.8° nominal — 0.02% errors", "$1.23/hr".

## Design system

### Palette

| Token | Hex | Role |
|---|---|---|
| `--plum` | `#140E1C` | abyss background (deep-sea plum) |
| `--membrane` | `#241B33` | membrane / organelle body fill |
| `--teal` | `#2DD4BF` | bioluminescent teal — healthy tissue, heartbeat, drift resorbed |
| `--magenta` | `#E879F9` | vesicles / event flow, respiration, crew presence |
| `--lime` | `#A3E635` | edge tissue (cloudflare organelles), metabolism, antibodies |
| `--ink` | `#C9C3D9` | lavender-gray body text (≥ 4.5:1 on plum) |
| `--coral` | `#FB7185` | inflammation / fever / immune response |
| `--teal-glow` … `--coral-glow` | rgba derivatives | box-shadow bioluminescence per organ |

### Type scale (single stack: Trebuchet MS / Segoe UI / Verdana)

| Size | Weight | Use |
|---|---|---|
| 21px / 600 | header | bindle name |
| 16px / 700 | organ | organelle names |
| 14px / 400 | body | log entries, notes |
| 12.5px / 600 + 0.14–0.16em tracking | sense | vital labels, section headings |
| 11.5–12px / 400 | micro | organ metadata, annotations, legend |

### Spacing & shape

| Token / rule | Value |
|---|---|
| page padding | 22–24px |
| card gaps | 14–20px |
| blob radii | `--r-blob-a`, per-organ four-corner percentages, ±2–4° rotation |
| soft container radii | 32–64px, always uneven per corner |
| glow recipe | radial-gradient highlight at 36%/30% + outer shadow 24–40px + inset 14–24px |

### Components

- **Organelle** — blob div sized by allocated resources (postgres 228×192 is the largest organ),
  name + version/cells/memory + one vital pulse line, tinted glow by health.
- **Membrane** — translucent blob enclosing a camp's organelles, labeled with camp name and runtime.
- **Vessel** — SVG cubic path between organ centers with 2–4 vesicle dots; magenta = queue/event flow.
- **Vital** — rounded card: tracked lowercase sense label, plain-language reading, annotated SVG trace, footnote.
- **Immune entry** — pill row with blob-shaped colored cell, bold event name, narrative, timestamp.

## Look & feel

Deep-sea documentary, not dashboard: a near-black plum abyss with faint teal/magenta ambient
glows and drifting plankton dots. Two translucent membranes hold six softly glowing organelles
connected by curved vessels carrying vesicles; the worker runs a mild coral fever with a note
pinned beneath it. The right column reads like a bedside chart — ECG deploys, breathing traffic,
a resorbed fever spike, a lean metabolic burn — and the immune log below narrates recovery in
biological language. Everything is curved; the darkness feels calm, not ominous, because the
organism is visibly alive.

## Ideation log

1. **Anatomical cross-section (single giant cell with labeled organelles à la biology textbook,
   leader lines to a margin key)** — rejected: leader-line keys re-introduce list/table reading
   and the textbook framing feels static, the opposite of "alive".
2. **Full-body silhouette (humanoid figure; services mapped to heart/lungs/gut)** — rejected:
   forcing six services onto fixed human organs breaks as soon as a bindle has a seventh service,
   and the literal body is uncanny for infra; cell/tissue scale generalizes.
3. **Animated ecosystem (JS-driven drifting organelles, pulsing glows, swimming vesicles)** —
   rejected: the deliverable must render complete without JS; motion was traded for layered
   static glow, plankton, and vesicle trails that imply flow.
4. **Petri-dish top-down with radial vitals ringing the organism (circular gauges around the
   dish)** — rejected: radial gauges compressed the four vitals into unreadable arcs at 1600×1000;
   a stacked right-hand chart column keeps the physiological traces legible.

## Hardening notes

- **Pass 1 → 2:** organelles rendered as near-perfect ellipses — pushed to strongly asymmetric
  four-corner radii (`65% 35% 55% 45% / 40% 65% 35% 60"` etc.) with ±2–4° rotations; the vein SVG
  viewBox (992×636) didn't match the dish so vessels floated off their organs — rebuilt at
  988×662 with `preserveAspectRatio="none"` and recomputed anchor points; swapped vital colors so
  temperature owns coral (heat) and metabolism owns lime (energy); brightened vessels/vesicles;
  enlarged membranes and organs to swallow dead space under postgres; added a faint abyssal
  current and more plankton.
- **Pass 2 → 3:** empty pocket under blob store inside the cloudflare membrane — filled with an
  on-domain "osmosis is secretless" annotation (secretless references through the membrane);
  temperature trace sat too low leaving a hollow band — raised the baseline, moved the fever
  caption beside the spike, added a 36.6° axis whisper.

## Distinctiveness check

- **01 Terrain** — Terrain surveys a cartographic landscape from above; Organism looks *into* living tissue through a microscope, with no map, contours, or compass.
- **02 Broadsheet** — Broadsheet sets typeset columns on newsprint; Organism has no columns, rules, or editorial voice — only glowing anatomy on an abyssal ground.
- **03 Mission Control** — Mission Control is a hard-edged launch console of gauges and countdowns; Organism forbids right angles and reads health as vitality, not go/no-go.
- **04 Quiet Garden** — Quiet Garden is calm, ambient restraint; Organism is saturated bioluminescence with fevers, immune responses, and visible pulse.
- **05 Conversation** — Conversation is a Crew dialogue transcript; Organism has no chat at all — crews appear only as antibodies and attending physicians in an immune log.
- **06 Brutalist Terminal** — Brutalist Terminal is monospace text-file honesty; Organism is anti-terminal: zero monospace dominance, zero phosphor green, everything curved and glowing.
- **08 Metropolis** — Metropolis builds an isometric city of rigid architecture; Organism grows soft asymmetric cells — biology versus civil engineering.
- **09 Timetable** — Timetable is a Swiss departures board of rows and columns; Organism contains no tabular grid anywhere, vitals are continuous physiological traces.
- **10 Patchbay** — Patchbay is racked hardware with jacks and cables; Organism's connections are organic vessels carrying vesicles, not patch cords between units.
