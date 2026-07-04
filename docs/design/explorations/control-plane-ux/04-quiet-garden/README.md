# 04 · quiet garden

**Thesis: silence is the signal.** Calm technology for the HoBo junction home screen — the absence of alarm is information you can trust.

## Philosophy

Every incumbent control plane greets its operator with a wall of dashboards that all shout at once, so the operator learns to trust none of them. Quiet Garden inverts the contract: the platform's default state is *composed stillness*, and stillness is load-bearing. Because HoBo's Crew agents (SRE, Endpoint Monitor, GitOps, Platform Engineer) act on the append-only event log continuously, the home screen's job is not to show data — it is to show that *nothing needs you*, and to whisper the one thing that might. Sarah opens the junction at 06:26 and knows, in a single breath, that all three yards are settled, that the crew quietly reconciled drift while she slept, and that exactly one thing (worker queue depth in camp fly-ams) is being watched on her behalf. Whitespace is the material; the bone-white field *is* the interface.

## Design principles

1. **One attention item, ever.** The screen may hold exactly one apricot element chain (bloom → stem → choices → sparkline dot). If two things need attention, the second waits or the crew handles it. Apricot appears nowhere else, so peripheral vision finds it in under a second.
2. **Age fades to silence.** The last five events render as a whisper-line whose opacity decays with age (0.80 → 0.26). History is present but never competes with now — the visual metaphor for an append-only log settling into the past.
3. **The crew speaks first, softly.** Copy is written as reassurance with agency attached: "sre crew is watching · no action needed from you yet", choices are "let the crew handle it / look closer". The default verb is *delegate*, not *drill down*.
4. **Nothing blinks, everything breathes.** The only motion is a 7-second scale breath on the orb. No spinners, no pulsing badges, no live counters. Lowercase everywhere; even the wordmark refuses to raise its voice.
5. **Numbers are whispered, not charted.** Cost ("$29.40 today · within budget"), uptime ("41 days settled"), and per-service history (hair-thin sparklines, no axes) appear at the smallest size with wide tracking — findable when sought, invisible when not.

## Design system

### Palette

| token | hex / value | role |
|---|---|---|
| `--bone` | `#F7F6F2` | page field — the material itself |
| `--mist` | `#ECEAE3` | ambient radial washes, depth without rules |
| `--sage` | `#8FA98F` | health — orb body, sparkline strokes |
| `--sage-deep` | `#7A957A` | orb rim, sparkline emphasis |
| `--sage-pale` | `#C9D6C9` | orb highlight midtone |
| `--graphite` | `#3A3A38` | all text (4.5:1+ on bone) |
| `--apricot` | `#E0A458` | the *only* attention hue — bloom, stem, choice underlines, one sparkline dot |
| `--shadow` | `rgba(122,149,122,0.22)` | orb's soft sage shadow |
| `--shadow-far` | `rgba(58,58,56,0.05)` | distant graphite ground shadow |

### Type scale (4 sizes, 1 family)

| token | size | use |
|---|---|---|
| `--fs-presence` | 64px / w200 | the settled-days numeral inside the orb |
| `--fs-voice` | 26px / w200 | greeting ("good morning, sarah. the junction is quiet.") |
| `--fs-body` | 16px / w300 | orb caption, attention headline |
| `--fs-whisper` | 13px / w300 | corners, whisper-line, choices, garden labels |

Family: `system-ui, 'Segoe UI', 'Helvetica Neue', sans-serif` — light humanist, one stack. Tracking: `--track-wide: 0.18em` on the smallest labels, `--track-soft: 0.04em` elsewhere. Line-height 1.9 body, 2.5 in the whisper-line. `text-transform: lowercase` on the body — the whole screen physically cannot shout.

### Spacing

| measure | value |
|---|---|
| page margin (corners) | 72px / 58px |
| orb field | 560px circle at x≈516, y≈488 (off-center left) |
| halo bleed | −110px beyond orb |
| right column origin | x 1012 (golden-ish split against the orb) |
| garden gap | 74px between plants, 46px off the bottom edge |

### Components

- **orb** — layered radial gradients (highlight at 38%/26%) + breathing halo + sage drop shadow; whole-junction health. No border, no ring — its edge is a gradient falloff.
- **stem** — a single 1.2px apricot bézier from the orb's edge to the attention bloom; the only line on the page.
- **bloom** — 9px apricot dot with two soft glow rings; anchors the one attention item.
- **quiet choices** — bare text with a 1px apricot underline (no fills, no boxes): "let the crew handle it · look closer".
- **whisper-line** — five timestamped events, tabular-numeral times, opacity ladder .80/.62/.48/.36/.26.
- **sparkline garden** — six 150×34 hair-thin polylines (api, web, worker, postgres, queue, blob), no axes, no values; the worker line rises and ends in the page's only other apricot mark.

## Look & feel

A bone-white field with two barely-there mist washes gives the page atmosphere without a single rule or border. The sage orb sits off-center left like a stone in a raked garden, breathing on a 7-second cycle, carrying "41 days settled" in its heart. From its right shoulder one slender apricot stem arcs up to the day's only concern, which is phrased as reassurance and offers two whispered verbs. The right column fades downward through recent crew activity; the bottom edge is a row of six grass-thin lifelines. Total copy on screen: under 90 words, every one real.

## Ideation log

1. **Zen-garden concentric ripples** — yards as raked-sand rings around the orb, events as pebbles. Rejected: the rings read as chart axes / progress gauges from a distance, violating the no-axes rule and adding geometry that competed with the orb's stillness.
2. **Full-bleed gradient sky ("weather report")** — whole background shifts sage↔apricot with junction health, no discrete indicator at all. Rejected: beautiful but untrustworthy — ambient color alone can't be titrated ("is that 3% apricot?"), and it spends the single attention hue on atmosphere instead of the one item that needs it.
3. **Centered mandala layout** — orb dead-center, everything radiating symmetrically. Rejected: symmetry felt institutional, like a logo lockup, and left nowhere natural for the attention thread to *lead the eye*; the off-center stone-in-garden placement gives the stem a direction and the whitespace a shape.
4. **Breathing dot-per-service constellation** — 40+ tiny dots, one per service instance across camps. Rejected as dense data in disguise; six named sparklines say the same thing with less anxiety.

## Hardening notes

- **Pass 1 → 2:** the orb rendered as a heavy glossy billiard ball (strong specular, dark base) — re-tuned gradient stops (highlight to 38%/26%, rim pushed past 100%), enlarged the halo, softened inset shadows, added a 0.4px blur so the edge feathers into the field. Fixed a collision between the orb caption and the garden lede (caption up to y786, lede down to bottom:126). Un-wrapped "no action needed from you yet" by relaxing the who-line's tracking.
- **Pass 2 → 3:** "days settled" was washing out over the specular hotspot — deepened the center falloff and strengthened the text glow. Sparklines (besides worker) were nearly invisible at capture scale — moved strokes to `--sage-deep` at 1.1px, still hair-thin. Re-aimed the stem's bézier so its tip meets the bloom's glow ring. Corrected the date: 04 july 2026 is a saturday.
- **Lint:** PASS — 15 tokens in one `:root`, 1 font stack, 0 external references, ≤8 loose hex.

## Distinctiveness check

- **01 Terrain** — Terrain is a cartographic map dense with plotted geography; Quiet Garden is an empty field with one stone, no coordinates at all.
- **02 Broadsheet** — Broadsheet is typeset column-rule journalism to be *read*; Quiet Garden is under 90 words to be *glanced*, with no rules and no headlines.
- **03 Mission Control** — Mission Control is a dark launch console maximizing simultaneous signals; Quiet Garden is bone-white and permits exactly one signal.
- **05 Conversation** — Conversation is a turn-taking dialogue with the Crew; Quiet Garden never expects a reply — its two links are the only utterances invited.
- **06 Brutalist Terminal** — the Terminal is monospaced text-file honesty, everything shown raw; Quiet Garden curates almost everything away and fades the rest by age.
- **07 Organism** — Organism is living cells that multiply and cluster to show activity; Quiet Garden has a single body whose virtue is that it never multiplies.
- **08 Metropolis** — Metropolis is an isometric city of volumetric structures; Quiet Garden is deliberately flat, atmospheric, and architecture-free.
- **09 Timetable** — Timetable is a Swiss departures board of aligned rows and columns; Quiet Garden forbids tables and lets five whispered lines fade instead of align.
- **10 Patchbay** — Patchbay is tactile hardware density, jacks and cables everywhere; Quiet Garden has one thread total, and it's a plant stem, not a cable.
