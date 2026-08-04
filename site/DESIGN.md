---
version: alpha
name: HoBo Rubberhose
description: >
  Steamboat Willie / Cuphead / Fleischer-style rubberhose cartoon identity for the
  HoBo GitHub Pages site. Thick ink outlines, hard sticker shadows, film grain,
  black-and-white day/night inversion, and title-card lettering — never flat SaaS
  chrome.
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
**agent-facing contract**; the stylesheet is the runtime truth. Prefer tokens over
hardcoded hex in new work.

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

One easing token, `--ease: cubic-bezier(0.22, 1, 0.36, 1)`. It overshoots and
settles — squash-and-stretch expressed as a curve. Anything that needs a
*different* curve is either not rubberhose or is a special case that must say
why in a comment.

**Durations.** Three steps, and no fourth:

| Token | Value | For |
|---|---|---|
| `--dur-tap` | 120ms | State you caused: press, toggle, focus |
| `--dur-move` | 220ms | Something travelling: hover lift, disclosure |
| `--dur-scene` | 420ms | Something arriving: page-level reveal |

Nothing exceeds 420ms. A rubberhose gag lands in under half a second; a UI that
takes longer is not being charming, it is being slow.

### MA (間) — the interval is the animation

The Japanese `MA` is not empty time, it is *charged* time: the pause that gives
the next beat meaning. Applied here:

**The Rest Rule.** A sequence of entering elements is staggered by **60ms**, and
the stagger is the content. Three cards arriving together is a state change;
three cards arriving 60ms apart is a sentence. Never stagger more than five
things — past that it stops reading as rhythm and starts reading as lag.

**The Held Breath Rule.** Anything that reveals on scroll waits until it is
**15% into the viewport**, not at the edge. The gap between "it could animate"
and "it does" is the MA. Triggering at the boundary makes the page feel twitchy.

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
