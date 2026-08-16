---
version: alpha
name: HoBo Rubberhose
description: >
  Steamboat Willie / Cuphead / Fleischer-style rubberhose cartoon identity for the
  hobo-code interactive TUI. Same ink/paper tokens as site/DESIGN.md. Thick ink
  outlines, hard sticker shadows, black-and-white day/night inversion, and
  title-card lettering — never flat SaaS chrome.
colors:
  primary: "#101010"
  on-primary: "#ffffff"
  secondary: "#4a4a46"
  tertiary: "#c5301c"
  on-tertiary: "#ffffff"
  neutral: "#ffffff"
  neutral-raised: "#ffffff"
  neutral-inset: "#f4f4f2"
  ink: "#101010"
  soot: "#1a1512"
  paper: "#ffffff"
  cream: "#f2f1ec"
  mute: "#4a4a46"
  faint: "#6e6d68"
  border: "#e3e2de"
  border-strong: "#c9c8c2"
  spark: "#c5301c"
  go: "#14672c"
  code-bg: "#f7f7f5"
  night-bg: "#0a0a0a"
  night-text: "#f2f1ec"
  night-raised: "#111111"
typography:
  h1:
    fontFamily: Chewy
    fontSize: 3rem
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: 0.01em
  h2:
    fontFamily: Chewy
    fontSize: 2.25rem
    fontWeight: 400
    lineHeight: 1.15
  h3:
    fontFamily: Chewy
    fontSize: 1.5rem
    fontWeight: 400
    lineHeight: 1.2
  body-md:
    fontFamily: system-ui
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.65
  body-lg:
    fontFamily: system-ui
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.65
  label-caps:
    fontFamily: system-ui
    fontSize: 0.75rem
    fontWeight: 700
    letterSpacing: 0.08em
  mono:
    fontFamily: ui-monospace
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: 4px
  md: 12px
  lg: 18px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  "2xl": 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: 14px
    typography: "{typography.h3}"
  button-primary-hover:
    backgroundColor: "{colors.spark}"
    textColor: "{colors.on-tertiary}"
  button-ghost:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: 14px
    typography: "{typography.h3}"
  card:
    backgroundColor: "{colors.neutral-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
  card-border:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  hairline:
    backgroundColor: "{colors.border-strong}"
    textColor: "{colors.ink}"
  hairline-soft:
    backgroundColor: "{colors.border}"
    textColor: "{colors.ink}"
  badge:
    backgroundColor: "{colors.neutral-inset}"
    textColor: "{colors.mute}"
    rounded: "{rounded.pill}"
    padding: 8px
  caption:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.faint}"
    typography: "{typography.label-caps}"
  header:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: 60px
  code-block:
    backgroundColor: "{colors.code-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 16px
  link:
    textColor: "{colors.ink}"
  link-hover:
    textColor: "{colors.spark}"
  focus-ring:
    backgroundColor: "{colors.spark}"
  status-go:
    backgroundColor: "{colors.go}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: 8px
  broadcast-frame:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  mascot-bo:
    backgroundColor: "{colors.soot}"
    textColor: "{colors.cream}"
  theme-night:
    backgroundColor: "{colors.night-bg}"
    textColor: "{colors.night-text}"
  theme-night-surface:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.cream}"
---

## Overview

**Brand & Style:** HoBo’s public site is a **1930s rubberhose cartoon** — Steamboat
Willie ink-and-paper, Cuphead title cards, Fleischer bounce — not a pastel product
dashboard. Everything is **ink on paper by day** and **paper on ink by night**
(exact theme inversion). Bo the bindlebug is soot-colored with googly eyes; scenery
is *traced* illustration, never generative glop.

Voice is “homeward bound” whimsy with precise technical tables. Agents generating
or editing UI **must** read this file first and keep every surface on-system.

Canonical CSS implementation: `site/src/styles/global.css`. This DESIGN.md is the
**agent-facing contract** for both the Pages site and the hobo-code TUI. Prefer
tokens over hardcoded hex in new work. Terminal chrome lives in
`packages/code/src/tui-components.tsx` and may only use `TUI_TOKENS` from
`tui-tokens.ts` (mapped 1:1 from the colors table below). The Evidence SPA
(report, desk controls, wrapper/bridge) is the same ink-on-paper contract:
shared CSS in `evidence-chrome.ts`, linted by `evidence-design-lint.test.ts`.
No SaaS blues, 1px hairlines, or dark-terminal palettes. The live report is the
visual **Tasks** board with provenance, pinned to the running `hobo-code` chat
(`current-session.json`) — same work items as Tab-tasks, laid out as a report
with reasons, actors, and looks — not a Tests/ADRs checklist.

### Terminal translation

| DESIGN.md pillar | TUI host |
|---|---|
| Thick ink outlines | `┏━┓` box drawing, never `─` hairlines |
| Hard sticker shadows | offset `▒` block, +1 col / +1 row |
| Title-card type | Chewy `HOBO_LOGO_TUI` sprite |
| Strict B&W | no colour except spark/go |
| Spark / go rare | vermillion refusal, green done |
| Reduced motion | static Bo frame |
| Command dock | always-on `[ /dev ] [ /templates ] …` rail inside the broadcast frame |
| Broadcast bezel | `BroadcastFrame`: rounded pixel CRT (`█▄▀▌▐`), **centered** title plaque, symmetric film perfs `▪`, hard `▒` sticker shadow. Never a decorated `┏━┓` box or hairline `─`. |

The TUI does **not** use OpenTUI's Zig/Bun host. This package is Node. The
component system is a retained semantic tree (id / role / class / query) with
React-style function components (`BroadcastFrame`, `InkCard`, `InkTable`,
`ChatTranscript`, `SlashPalette`, `ApprovalDialog`, `BtwAside`, `TextPane`,
`WelcomeSurface`, `AgentsCatalog` (`/agents` configure-only harness tree: Hobo Bo
first, subagents from `.hobo/agents`, expand/collapse/scroll, Enter
opens model/effort configure — HoBo Bo also lists subagents and always
`+ create subagent`; live terminals
are `/mux`),
`AgentPanes` (herdr-shaped Session → Tab → Pane via `/mux` or Tab when work
exists: session line,
Detach/Stop/New tab, tab strip, pane headers with `focused`, Focus/Prompt/Split/
Close/Start agent, live ANSI tmux capture, type+Enter steers; empty Enter
attaches keys inside the TV bezel — Ctrl+\ leave (Ctrl+] also);
Agents `[`/`]` focus split panes (both stay visible side-by-side); `/mux pane` splits;
`,`/`.` sessions; `↑`/`↓` scroll when detached;
session ops via `/mux <tab|pane|attach|focus|detach|stop>` only — never bare letters; pinned
`AGENTS_KEY_LEGEND` / `AGENTS_CATALOG_KEY_LEGEND` on the command rail; status strap leads with the active
agent label (`Hobo Bo` / `Codex` / `Pi`); no separate Tasks tab),
`CommandRail`, `StatusStrap` under `ShellChrome`); `pi-tui` remains the differential framebuffer. The shell
surface is a `broadcast-frame` (rounded CRT / film-broadcast bezel) generated by
`broadcastFrame` in `tui-broadcast.ts` — hood, glass lips, centered plaque,
symmetric perfs — not a decorated unicode box. `BtwAside` is a live **overlay
sticker** (`.overlay`) blitted lower-right on the glass so the parent
transcript stays visible; it recaptures the parent thread on every answer and
parent append. Title, rail, and welcome art are
centered. The initial screen puts talk/patterns/focus plus occupancy endpoints
in an `InkTable` (named `*.hobo.localhost` URLs, never loopback IPs).
The local resources dashboard is the one exception: it links each
endpoint (new tab + copy) and also shows the loopback listen address.
Occupancy deploys the real OpenDelivery engine next to the Station
(`rollout.code.local.hobo.localhost`) and the real OpenExperiment
engine (`experiment.code.local.hobo.localhost`). Experiments are an
always-on Station sidecar, not a Capabilities-table row. Residual
secret/crypto kinds use the Station-local KMS sidecar. Command history,
aliases, and env vars live in a Station SQLite sidecar — ink search in
`hobo-code history`, not an Atuin TUI.
(`kms.code.local.hobo.localhost`). The dashboard is a **control plane, not a
poster**: Azure-portal drill-down with Aspire-style resource tables, in
rubberhose skin. Hash-routed views mirror the topology — **station ⊃ yards ⊃
camps ⊃ bindles ⊃ resources** — one level per view, never an always-expanded
tree:

- **Overview (`#/`)** — the featured Station plaque (Chewy “station” + mute id
  + ready lamp, location as flat chips: environment · tenant · scope, three
  occupancy doors dashboard / Evidence / OTLP; other Station hosts fold as
  `hosts`; **capabilities** is a labeled `<details>` at the **bottom** of the
  plaque, collapsed, as a columnar grid) plus a **yards** card listing *every*
  yard as one summary row: lamp, yard glyph, name link, flat rollup chips
  (camp/bindle glyph counts, running x/y dot, signal counts). Peers appear
  only when peer Stations exist.
- **Yard (`#/yard/<id>`)** — lists the yard's **camps** as summary rows
  (bindle count, running x/y, signal rollups) plus the yard's own managed
  resources. Web/api/kv belong to bindles, never to the yard listing.
- **Camp (`#/camp/<id>`)** — lists the camp's **bindles** as summary rows
  (resource count, running x/y, signal rollups) plus camp-owned managed
  resources that are not bindle resources.
- **Bindle (`#/bindle/<id>`)** — the bindle's **resources** as a flat aligned
  table (uppercase `thead`: resource / endpoint / signals; fixed-width action
  column so planks hang in one rail), endpoint rows carrying the primary
  named link.
- **Resource (`#/resource/<id>`)** — endpoint links (named + quiet loopback +
  copy plank) beneath the facts.

Every scope view — yard, camp, bindle, resource — carries its **own** facts
plaque (`.trust`: kind, owner, env, state, fidelity, scope, freshness,
export, last signal) and its **own** signals: logs / traces / metrics tabs as
icon planks (active plank inverted) fed by
`/api/resources/:id/logs|traces|metrics`.

Breadcrumbs (station › yard › camp › bindle › resource — ink chips with drawn
chevron marks) carry navigation and browser back works; row names are links,
which is the drill-down affordance. Every listing uses **one row grammar** — `lamp · kind
glyph · name · (endpoint) · signal counts · actions` — with per-table fixed
grid columns. There is no sibling “signals” / OTel card — OTel is lamp +
per-row signal counts (log/trace/metric glyph chips fed by `/api/telemetry`),
and the board re-projects itself every few seconds while the tab is visible
(a control plane never shows stale state). Pane titles pair a glyph with a
Chewy caption (yards / peers). Chewy is embedded like Evidence
(`evidenceDocumentCss`). Day/night is OS `prefers-color-scheme` until the user
picks; `data-theme` + `hobo-theme` storage and a moon/sun plank toggle match
the site. Night inverts paper/ink onto `night-bg` / `night-raised`. Spark
2.5px focus.

Two affordance laws bind this chrome (mirrored in `site/DESIGN.md` Buttons):
**pressable = raised** — only real controls wear the 44px chamfered plank with
ink rim, hard sticker shadow, and hang-and-bounce hover invert; inert markers
(lamps, kind glyphs, lock badges, signal chips) are flat ink with no shadow —
and **icon verbs** — action buttons carry drawn monochrome glyphs
(play/stop/restart/copy/sun/moon), locale-independent, with the localized word
only in `aria-label`/`title`, never as the button face.
`evidence-design-lint.test.ts` enforces both.

An empty station or yard teaches (`hobo-code dev` hint), never a blank pane.
Start/stop is a single
play/square toggle; restart is Bindle-only. Copy flashes go on success
and spark on refuse — never a lying success. Errors are an inline
banner, never `alert()`. Stopped lamps stay paper, not vermillion.
Endpoints show one primary named link plus a single copy plank; the loopback
listen address is a quiet mono footnote, not a second link block.
Long URLs ellipsize so cards do not bleed. Fleet appears only when peer
Stations exist. A kind is
available or it is not. Tests query those controls by id/role/class.
Every
`tui-*` source plus `interactive-shell.ts` is in DESIGN.md lint scope (`tui-design-lint.test.ts`). Evidence
and dashboard HTML chrome is in the same scope (`evidence-design-lint.test.ts`). Bare
`/template` and `/templates` list the local pattern catalog (zero LLM).

### Aesthetic pillars

1. **Rubberhose geometry** — pie-cut eyes, sausage limbs, squash-and-stretch motion
   (honor `prefers-reduced-motion`).
2. **Thick ink outlines** — 2–3px borders; hard **sticker** offset shadows (not soft
   Material elevation blobs).
3. **Title-card type** — **Chewy** for display headings; quiet system-ui for body.
4. **Film grain** — faint fixed grain overlay; old-reel vibe without muddy contrast.
5. **Strict B&W base** — neutrals dominate; **spark** (vermillion) and **go** (green)
   are rare interactive/status accents only — never rainbow chrome.
6. **Traced art only** — mascot and scene panels are reference traces (`Mascot`,
   `scenes/*`, parallax plates). Do not invent flat vector substitutes.
   Scene panels are being rebuilt one at a time from the approved prop art in
   the media catalogue (`media/public/reference/scene-props/`), each prop
   machine-traced into rigged layers that animate in place — `Crossroads` is
   the first: the signpost's five boards wobble around their nails while the
   post stays planted, composed with the supplied parallax plates and Bo's
   idle strip. Prop ink follows the mascot night rule (lifts to soot with a
   light rim, never inverts); plates invert to chalk; clouds keep their own
   ink. Each remaining scene swaps only after its owner-approved preview.

## Colors

Palette is **ink / paper** with two functional accents.

| Token | Light role | Notes |
|---|---|---|
| **primary / ink** (`#101010`) | Headlines, primary buttons, outlines | Steamboat soot-black |
| **neutral / paper** (`#ffffff`) | Page ground | Clean cel paper |
| **secondary / mute** (`#4a4a46`) | Captions, meta | Warm gray, not blue-gray SaaS |
| **tertiary / spark** (`#c5301c`) | Focus, hover links, danger pop | Cuphead vermillion — sparingly |
| **go** (`#14672c`) | Success / positive status | Rare |
| **soot** (`#1a1512`) | Bo’s body fill | Never pure `#000` on the bug |
| **cream** (`#f2f1ec`) | Night text / ink inversion pair | Paper-on-ink |

**Dark theme:** invert grounds and inks (`night-bg` / `night-text`). Accents stay
readable; do not invent neon palettes.

**Do not:** flat brand gradients, purple AI glow, glassmorphism, or full-color
product illustration.

### The five palettes

Colour is a **second axis**, orthogonal to day/night. `data-theme` stays the
inversion pair; `data-palette` re-inks the paper and the line. Absent the
attribute you get `ink` — the canonical Steamboat Willie black-and-white — so
the default is the *absence* of a choice, not a choice.

| Palette | `data-palette` | Paper / ink (day) | Character |
|---|---|---|---|
| **Ink on Paper** | *(none)* | `#ffffff` / `#101010` | The canonical. Maximum MA — the page is mostly empty on purpose. |
| **Dusk Meadow** | `dusk` | `#fbf5e9` / `#2e2418` | Ghibli golden hour. Warm paper, sepia line. |
| **Rain Glass** | `rain` | `#f2f5f7` / `#1b2732` | A downpour seen through glass. Cool, quiet, indigo. |
| **Cel Bloom** | `cel` | `#f7f0e1` / `#241a12` | Cuphead title card. Card stock and vermillion. |
| **Moss Quiet** | `moss` | `#f1f4ee` / `#1e2a1c` | Forest floor. The softest of the five. |

Every palette overrides the same sixteen tokens and each is an inversion pair,
so night is never a separately-tuned palette — it is the same decision, flipped.

**The Same Contract Rule.** Every palette carries exactly one paper, one ink,
and two rare accents (`spark`, `go`). A palette that needs a third accent is not
a theme, it is a different design system. This is what lets The One Voice Rule
survive a switch: the accents stay rare in all five, so rarity keeps meaning
what it meant.

**The Absent Default Rule.** Selecting `ink` *removes* `data-palette` rather
than setting it. The canonical look is what you get by not choosing, which keeps
a stored preference from quietly becoming a fifth thing to maintain.

**A palette declares 16 values; the rest derive.** `--ink`, `--link`,
`--meadow`, `--sky` and their `-soft` pairs, plus `--code-bg` and `--hero-grid`,
are `var()` indirections onto `--text`, `--accent` and `--bg` — so re-inking the
paper re-inks the links, rules and code blocks automatically. This is not a
convenience: when those eight were written out per-theme instead, every palette
silently inherited the ink theme's pure-black `#101010` links, and Dusk shipped
warm paper with cold links. A palette that has to restate a derived token is a
sign the token belongs in the declared set, not that it should be overridden.

The genuinely shared tokens are `--ember-a/b/c`, `--glow` and `--shadow`: a
neutral depth ramp that is deliberately palette-independent, because shadow is
paper behaviour, not ink colour.

Palettes are offered behind a disclosure, never as five buttons in the bar. The
designer persona's clutter thresholds are the lowest available and
`junior-frontend` treats choice overload as a hard budget — so five options may
exist, but they may not shout. Closed, the picker costs one icon.

## Typography

- **Display (h1–h3):** Chewy — rubberhose title card, slightly uneven friendly letterforms.
- **Body:** system-ui stack — legible docs prose at 1rem / 1.65 line-height.
- **Labels:** small caps tracking for badges and step numbers.
- **Mono:** ui-monospace for code only.

Headlines can be slightly oversized and “bouncy”; body stays calm so technical
tables remain scannable.

## Layout

- Max content width ≈ **1160px** container; header ~**3.75rem**.
- Spacing scale: 4 / 8 / 16 / 24 / 40 / 64 — generous cartoon breathing room.
- Docs: sticky sidebar + prose column; landing: hero + story scenes + bento cards.
- Base path deploy: `/HoBo/` — links in markdown include the base.

### TUI scroll interaction

The InteractiveShell owns its viewport (alt-screen). Conventions:

- **Follow live** only when `chatScroll === 0`. Append/stream keep a non-zero
  offset (no yank while reviewing).
- **Page** = half viewport (`PgUp`/`PgDn`); **half-page** = `Ctrl+U`/`Ctrl+D`.
- **Home/End** jump oldest/live on chat; top/bottom on document panes.
- Empty-input `↑`/`↓` scroll the focused surface — never prompt history.
  On **Agents**, those keys scroll capture only (do not steal harness focus)
  unless **attached** (keys forward to the focused tmux pane). **PgUp/PgDn /
  Home/End** always scroll the TV capture — including while attached — so
  multi-turn conversations stay reachable. Capture pins to the newest lines
  (`paneScroll === 0`, end-origin like chat); title shows `↑N` when reviewing.
- **Ctrl+O** opens transcript less-mode (`j`/`k`, `q`/Esc exit). Printables
  do not reach the composer while less is open.
- Title shows `chat ↑N` when scrolled; strap adds `history · End live`.
- **AgentsCatalog** (`/agents`): configure harnesses only — Hobo Bo first
  (not local inference, not a separate top-level agents section). Expandable
  subagents under HoBo Bo from `.hobo/agents`. Enter opens configure (model +
  effort); HoBo Bo configure also lists subagents plus always `+ create
  subagent` (empty workspace still selectable; writes
  `.hobo/agents/<id>/instructions.md`). Bo/subagent model field cycles the Bo
  catalog (ollama · saved harness models · BYOK · openai-compatible) with
  Package-URL identity (`pkg:openai/gpt-5?via=codex` vs `?via=azure`). Cursor
  indexes clamp — no past-end / negative selection. ↑↓ navigate, →/Space
  expand, Esc close (from a subagent under HoBo Bo, Esc returns to HoBo Bo form
  first; create-id Esc cancels). Live terminal connect is **`/mux`** (or Tab
  when work exists) — not `/agents`. Tab while configure/catalog is open never
  leaves the modal.
- **AgentPanes** (`/mux`): herdr Session → Tab → Pane chrome + live ANSI capture +
  steer. Empty Enter attaches in the TV bezel (keys → focused leaf); Ctrl+]/Ctrl+\
  leave. Key legends are pinned on the
  command rail (`AGENTS_KEY_LEGEND`), not in the scrolling body. `[`/`]` panes
  (tab fallback; works while attached) and `{`/`}` tabs are redundant on single-pane seats; `,`/`.`
  sessions. Session ops are slash-only under `/mux`
  (`tab` · `pane` · `attach` · `focus` · `detach` · `stop`) so chat never loses printable keys. Status strap leads with the
  active agent (`Hobo Bo` on chat; `Codex`/`Pi`/… on Mux).
- Mouse wheel is not wired; keyboard path is complete (`shell-scroll.ts`).

## Elevation & Depth

Not Material elevation. Use **sticker depth**:

- Hard offset shadows (e.g. 4px 4px 0 ink) on cards/buttons when pop is needed.
- Thick 2–3px borders in `ink` / `border-strong`.
- Film grain overlay sits above the whole page (non-interactive).
- Parallax trail band uses **supplied plates**, not CSS-drawn hills.

## Motion

Rubberhose is an *animation* idiom. A still rubberhose surface is a poster of
one — the bounce is the point, and motion here is identity, not decoration.

But the persona who owns this identity declares `prefers-reduced-motion`, and
two more declare `cognitive-load-sensitive`. So the rule is not "animate less".
It is: **every motion must survive being removed.** If taking the animation away
breaks comprehension, the animation was carrying information that should have
been in the layout.

### The curve

**Two curves, and only two.**

| Token | Curve | Peak | For |
|---|---|---|---|
| `--ease` | `cubic-bezier(0.22, 1, 0.36, 1)` | 1.000 | Everything. Decelerates hard and stops clean. |
| `--ease-boing` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 1.098 | The bounce: overshoots and settles — squash-and-stretch expressed as a curve. |

This entry used to claim there was one token and that `--ease` overshot. Neither
was true: `--ease` peaks at exactly 1.0 and never overshoots, while three
hardcoded copies of the real bounce curve sat in the stylesheet unnamed and
unaccounted for. They are the same curve, so they are now one token.

Reach for `--ease` by default. `--ease-boing` is for motion whose *job* is to
read as cartoon physics — the postcard bob, the theme toggle, scene hovers — and
a third curve is not available. Anything that seems to need one is either not
rubberhose or is a special case that must say why in a comment.

A generic design linter will flag the bounce as dated and prescribe exponential
easing. On a flat SaaS surface that advice is correct. Here it is backwards:
[ADR-0149](../docs/design/adr/07-portability-extensibility.md#adr-0149) makes the
Fleischer identity binding, and the overshoot **is** the identity. Do not
quiet that warning by flattening the curve.

**Durations.** Three steps, and no fourth:

| Token | Value | For |
|---|---|---|
| `--dur-tap` | 120ms | State you caused: press, toggle, focus |
| `--dur-move` | 220ms | Something travelling: hover lift, disclosure |
| `--dur-scene` | 420ms | Something arriving: page-level reveal |

These govern **response** motion — transitions and entrances, anything the user
waits through. A rubberhose gag lands in under half a second; a UI that takes
longer is not being charming, it is being slow.

**Ambient loops are exempt, and the exemption is finite.** A looping animation
is scenery: nobody waits for it to finish, so a duration budget aimed at
perceived latency does not apply. Every current exception, in full — anything
not on this list is a bug:

| Animation | Duration | Why it is exempt |
|---|---|---|
| `boing` / `boing-sm` | 550ms / 450ms | The signature bounce. Overshoot needs the settle; clipped to 420ms it reads as a twitch, not a squash. |
| `postcard-sway` | 2.2s | Loop — homepage postcard drift |
| `plx-cloud-squash` | 3.1s | Loop — parallax cloud |
| `lost-bob` | 3.6s | Loop — Bo idling on the 404 |
| `blink` | 7.3s | Loop — Bo's eyes |

`boing` is the honest one to watch: it is response motion that exceeds the cap
on purpose. Two named exceptions is a style; a third would mean the cap is
fiction and the table should be rewritten instead of extended.

### MA (間) — the interval is the animation

The Japanese `MA` is not empty time, it is *charged* time: the pause that gives
the next beat meaning. Applied here:

**The Rest Rule.** A sequence of entering elements is staggered by **60ms**
(`--stagger`), and the stagger is the content. Three cards arriving together is
a state change; three cards arriving 60ms apart is a sentence. Never stagger
more than five things — past that it stops reading as rhythm and starts reading
as lag. *Implemented on the palette menu* (`.palette-picker[open] .palette-menu
button`), which has exactly five items — the rule's ceiling, which is why those
delays are written out rather than generated.

**The Held Breath Rule.** Anything that reveals on scroll waits until it is
**15% into the viewport**, not at the edge. The gap between "it could animate"
and "it does" is the MA. Triggering at the boundary makes the page feel twitchy.
*Implemented* as `animation-range: entry 15% entry 60%` on `.card` / `.scene`.
This rule was documented before it was true — the range began at `entry 0%`,
i.e. exactly the boundary the rule forbids — so treat an unimplemented rule here
as a defect in the stylesheet, not a nicety in the doc.

**The Empty Frame Rule.** Motion never fills space that was doing work by being
empty. If an animation's job is to draw the eye to a region, the region earns
attention by having margin around it, not by moving.

### Reduced motion — parity, not removal

`@media (prefers-reduced-motion: reduce)` must leave the surface **complete**,
not degraded:

- Transitions collapse to `none`. Elements land in their final state — they do
  not skip a step or appear un-styled.
- Looping and idle animation (Bo's idle, film grain drift, parallax) **stops
  entirely**. It is ambient, so its removal costs nothing.
- Anything that communicates state — focus rings, open/closed, loading — keeps
  communicating it, by colour, outline or position instead of movement.
- Scroll-triggered reveals become *already revealed*. Never leave content at
  `opacity: 0` behind a trigger that reduced-motion disabled: that is how a
  motion preference turns into a blank page.

**Two limits of the blanket rule, stated rather than papered over.**

*Delay is not duration.* Zeroing `animation-duration` leaves `animation-delay`
untouched, and an element with `both` fill holds its **backwards** fill for the
whole delay — so a staggered sequence still moves under reduced motion, just in
one jump per step instead of a slide. The Rest Rule's five buttons did exactly
that for 240ms. The reduced-motion block therefore zeroes `animation-delay` and
`transition-delay` as well. Any new stagger inherits that; none should re-add a
delay inside the reduced-motion block.

*Scroll timelines ignore duration entirely.* The blanket
`animation-duration: 0.01ms !important` does *not* stop a scroll-linked
animation: `animation-timeline: view()` is driven by scroll position, not by
time, so `rise-in` still runs under `prefers-reduced-motion`.
It is survivable only because that keyframe animates `translate` and nothing
else — the content is at worst offset by 34px, never hidden. **This is exactly
why the rules above forbid opacity in a scroll reveal**: the mechanism that is
supposed to disable it cannot. Any scroll-linked animation that touched opacity
would be invisible to precisely the users who asked for less motion.

**The audit test:** set `prefers-reduced-motion: reduce`, disable JavaScript,
and load the page. Every piece of content must be present and legible. If
anything is missing, the motion was load-bearing and the layout is wrong.

### Parallax

The trail parallax is the one place scroll drives motion. It is **ambient by
definition**: it carries no information, so under reduced motion it simply
stops, and nothing is lost. Layers move at fractions of scroll — never faster
than scroll itself, which reads as a glitch rather than depth.

### What motion may not do

- **Don't** animate `width`, `height`, `top` or `left`. Transform and opacity
  only; anything else invites layout thrash on a long docs page.
- **Don't** animate on page load except for the one scene-level reveal. A page
  that performs on arrival delays reading.
- **Don't** use motion as the only signal for anything. Colour, position or text
  must say it too.
- **Don't** loop anything in the reading column. Ambient motion belongs in the
  margins — literally.

## Shapes

- **md radius 12px** default cards/buttons; **lg 18px** for story cards.
- Pills for badges/step chips.
- Avoid 0-radius enterprise rectangles and 32px soft “iOS” bubbles.

## Components

### Buttons (cartoon signage — not pills)

Buttons are **roadside / tavern sign boards**, not soft ellipses or Material CTAs:

- **Silhouette:** chamfered wooden-plank `clip-path` (cut corners), never `border-radius: 999px`.
- **Ink rim:** hard outer stroke + painted inner rail + top rivet/nail heads.
- **Type:** Chewy title-card lettering (`h3` scale), slightly tracked.
- **Primary:** solid ink (or night cream) fill, paper text; hover can flash **spark** vermillion like a painted warning sign.
- **Ghost:** paper/board fill, ink rim, reads as an unpainted plank.
- **Motion:** hang-and-bounce on hover (`translate` + slight `rotate`); press flattens the sticker shadow.
- **Shadow:** hard offset sticker depth only — no soft blur elevation.

### Cards

- Paper ground, ink border, optional hard shadow; icons are monochrome or Bo art.

### Navigation

- Header on paper/ink with high contrast; active states use underline or ink chip,
  not rainbow tabs.

### Code

- Inset code blocks on `code-bg`; grayscale filter acceptable so syntax never
  breaks the B&W story.

### Focus

- **spark** outline 2.5px — always visible for a11y.

### Native chrome

OS defaults (grey scroll thumbs, system select arrows, triangle `<details>`
markers, bland cursors) are **off-system**. Own them in
`site/src/styles/native-chrome.css` (loaded from `Base.astro` after
`global.css`):

- **Scrollbars:** thick ink thumb on inset track; hover → `spark`; Firefox via
  `scrollbar-color` / `scrollbar-width`.
- **Cursors:** SVG ink pointer / hand / I-beam (`--cursor-ink`,
  `--cursor-point`, `--cursor-type`); `not-allowed` on disabled.
- **Selects:** `appearance: none` + ink chevron; sticker border + hard offset
  shadow. Multi-select lists use authored checklists (see Examples), not OS
  `<select multiple>` chrome.
- **Details:** ink chevron that rotates open; hide `::-webkit-details-marker`.
- **Checkboxes / radios / range:** `accent-color: var(--ink)`.

## Do's and Don'ts

### Do

- Lead with rubberhose / Steamboat / Cuphead language in new illustrations and
  motion (bounce, squash, pie eyes).
- Keep day/night as **inversion pairs** of the same tokens.
- Trace or reuse existing Bo / scene / plate art.
- Put interactive emphasis on **spark** sparingly; default chrome stays ink/paper.
- Validate this file with `pnpm --filter hobo-site run design:lint`.

### Don't

- Don’t introduce flat SaaS blues, purples, or multi-stop brand gradients.
- Don’t replace traced scenes with stock isometric 3D or “AI app” blobs.
- Don’t thin outlines below ~2px on primary chrome.
- Don’t soft-blur everything into modern glass UI.
- Don’t put free-text secrets or live credentials in examples (HoBo policy).
- Don’t link page prose to raw `docs/design/` repo paths — restate for Pages.
