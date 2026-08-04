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
