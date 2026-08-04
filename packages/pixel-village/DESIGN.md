---
version: alpha
name: HoBo Pixel
description: >
  Top-down pixel-RPG identity for the @hobo/pixel-village GAME PROJECT ONLY —
  16px tile grid, integer scaling, hard plum-black outlines, and a warm
  earth-and-slate palette from the vendored Kenney CC0 art. Scoped to this
  package: the HoBo product identity is HoBo Rubberhose (site/DESIGN.md), and
  this file must never be mirrored onto it.
colors:
  primary: "#3f2631"
  on-primary: "#f4f1e8"
  secondary: "#52607c"
  tertiary: "#37aaa5"
  on-tertiary: "#1a1420"
  on-danger: "#ffffff"
  neutral: "#c0cbdc"
  neutral-raised: "#d9e0ea"
  neutral-inset: "#8b9bb4"
  outline: "#3f2631"
  deep: "#262b44"
  stone: "#c0cbdc"
  slate: "#52607c"
  grass: "#84c669"
  path: "#eaa56c"
  wood: "#a35422"
  wood-dark: "#763b36"
  accent: "#37aaa5"
  danger: "#c34b35"
  gold: "#c66527"
  parchment: "#f4f1e8"
  code-bg: "#262b44"
  night-bg: "#1a1420"
  night-text: "#c0cbdc"
  night-raised: "#262b44"
typography:
  h1:
    fontFamily: Kenney Pixel
    fontSize: 3rem
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: 0.02em
  h2:
    fontFamily: Kenney Pixel
    fontSize: 2.25rem
    fontWeight: 400
    lineHeight: 1.15
  h3:
    fontFamily: Kenney Pixel
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
  sm: 0px
  md: 0px
  lg: 0px
  pill: 0px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  "2xl": 64px
components:
  button-primary:
    backgroundColor: "{colors.wood}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: 12px
    typography: "{typography.h3}"
  button-primary-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-tertiary}"
  button-ghost:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: 12px
    typography: "{typography.h3}"
  card:
    backgroundColor: "{colors.neutral-raised}"
    textColor: "{colors.outline}"
    rounded: "{rounded.sm}"
    padding: 16px
  card-border:
    backgroundColor: "{colors.outline}"
    textColor: "{colors.on-primary}"
  hairline:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.parchment}"
  hairline-soft:
    backgroundColor: "{colors.neutral-inset}"
    textColor: "{colors.outline}"
  badge:
    backgroundColor: "{colors.neutral-inset}"
    textColor: "{colors.outline}"
    rounded: "{rounded.sm}"
    padding: 8px
  caption:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.deep}"
    typography: "{typography.label-caps}"
  header:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.on-primary}"
    height: 64px
  code-block:
    backgroundColor: "{colors.code-bg}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: 16px
  link:
    textColor: "{colors.accent}"
  link-hover:
    textColor: "{colors.gold}"
  focus-ring:
    backgroundColor: "{colors.accent}"
  status-go:
    backgroundColor: "{colors.grass}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.sm}"
    padding: 8px
  status-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    rounded: "{rounded.sm}"
    padding: 8px
  tile:
    backgroundColor: "{colors.grass}"
    textColor: "{colors.outline}"
  tile-path:
    backgroundColor: "{colors.path}"
    textColor: "{colors.outline}"
  panel-inset:
    backgroundColor: "{colors.wood-dark}"
    textColor: "{colors.parchment}"
  theme-night:
    backgroundColor: "{colors.night-bg}"
    textColor: "{colors.night-text}"
  theme-night-surface:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.stone}"
---

## Overview

**Brand & Style:** HoBo is a **top-down pixel RPG**. The control plane is rendered
as a village you tend — Camps are buildings, Bindles are villagers, the active rail
is the road through town, and the approval gate is a notice board you stamp. Not a
dashboard with a mascot bolted on.

Every pixel sits on a **16px tile grid** and is scaled by **integers only**. The
palette, the outline colour, and the shapes all come from the vendored Kenney CC0
art, so hand-authored chrome and game art are visibly the same material.

Voice stays “homeward bound” whimsy with precise technical tables. Agents generating
or editing UI **must** read this file first and keep every surface on-system.

Canonical CSS implementation: `site/src/styles/global.css`. This DESIGN.md is the
**agent-facing contract**; the stylesheet is the runtime truth. Prefer tokens over
hardcoded hex in new work.

### Aesthetic pillars

1. **16px grid, integer scale** — art is authored at 16px and displayed at ×2/×3/×4.
   Never fractional scaling, never bilinear smoothing: always `image-rendering:
   pixelated` and `roundPixels`.
2. **Hard plum-black outline** — `#3f2631` edges everything: sprites, panels,
   buttons. 2–3px at ×1 CSS scale. No soft shadows, no blur, no Material elevation.
3. **Square corners** — every radius is `0`. Pixel art has no antialiased curves;
   rounded chrome instantly reads as foreign.
4. **Earth and slate** — warm wood/path tones against cool stone/slate, with
   **grass** for success, **danger** rust for failure, and **accent** teal reserved
   for interactive affordances. Colour is allowed and expected; it is not a
   monochrome system.
5. **Pixel display type, readable body** — the pixel face carries headings, title
   cards, and HUD labels. Body copy stays `system-ui` — small pixel faces fail
   accessibility at paragraph length.
6. **Sourced art, not drawn-in-code** — game and site art come from the vendored
   CC0 packs under `packages/control-yard/assets/kenney/`. Do **not** assemble props
   out of rectangles and lines in the renderer; that is how the previous surface
   ended up looking like a paint program.

## Colors

Warm earth against cool slate, with three functional accents. Taken from the
vendored art, so chrome and sprites never clash.

| Token | Role | Notes |
|---|---|---|
| **primary / outline** (`#3f2631`) | Every border and sprite edge | Deep plum-black, never pure `#000` |
| **deep** (`#262b44`) | Headers, dark panels, night ground | Cool navy |
| **neutral / stone** (`#c0cbdc`) | Panel and page ground | Light slate — the UI "paper" |
| **secondary / slate** (`#52607c`) | Captions, meta, secondary chrome | |
| **grass** (`#84c669`) | Success, healthy status, ground | |
| **path** (`#eaa56c`) | Roads, rails, warm highlight | |
| **wood** (`#a35422`) | Primary buttons, structures | |
| **tertiary / accent** (`#37aaa5`) | Links, focus rings, interactive | Teal — the only "come touch me" colour |
| **danger** (`#c34b35`) | Hazards, errors, destructive | Rust, not fire-engine red |
| **parchment** (`#f4f1e8`) | Text on dark grounds | |

**Dark theme:** grounds move to `night-bg` / `night-raised` and text to `stone`.
Accents keep their hue in both themes — a hazard must read as a hazard at night.

**Do not:** flat brand gradients, purple AI glow, glassmorphism, drop shadows with
blur, or vector illustration mixed in beside pixel art.

## Typography

| Style | Family | Size / line-height | Use |
|---|---|---|---|
| h1 | Kenney Pixel | 3rem / 1.1 | Page + title cards |
| h2 | Kenney Pixel | 2.25rem / 1.15 | Section heads |
| h3 | Kenney Pixel | 1.5rem / 1.2 | Buttons, sub-heads |
| body-md | system-ui | 1rem / 1.65 | Paragraphs |
| label-caps | system-ui 700 | 0.75rem, 0.08em | HUD labels, meta |
| mono | ui-monospace | 0.875rem / 1.5 | Code, ids, hashes |

Set pixel faces at integer multiples of their native size where possible so glyphs
stay crisp. Never set body copy in the pixel face.

## Layout

Container ≈1160px. Header 64px. Spacing scale 4 / 8 / 16 / 24 / 48 / 64 — multiples
of the 16px tile so chrome lines up with art. Game canvas is 1280×720 logical,
`Phaser.Scale.FIT`, integer-scaled.

## Elevation & Depth

Depth is **stacking and outline weight**, never blur. A raised panel is
`neutral-raised` with a 3px `outline` border and a hard 4px offset shadow in
`outline` at 100% opacity. Overlapping game props sort by depth band, not by shadow.

## Shapes

All radii are `0`. Buttons, panels, badges, and inputs are rectangles with hard
outlines. Chamfers, if ever needed, are stepped in whole pixels — never curved.

## Components

- **Button** — `wood` fill, `outline` border, `on-primary` label in the pixel face,
  hard offset shadow. Hover flips fill to `accent`; press removes the offset (the
  button visually sinks). Focus shows a 3px `accent` ring, always visible.
- **Panel / card** — `neutral-raised` fill, 3px `outline`, square corners.
- **Badge** — `neutral-inset`, square, label-caps.
- **Status** — `grass` for go, `danger` for hazard, `accent` for pending/interactive.
- **Link** — `accent`, underlined on hover in `gold`.

## Do's and Don'ts

**Do:** author on the 16px grid; scale by integers; outline everything in `#3f2631`;
use the vendored CC0 packs; keep body copy in `system-ui`; record every imported
asset in `packages/control-yard/assets/CREDITS.md`.

**Don't:** build props from rectangles and lines in renderer code; mix vector
illustration with pixel art; use rounded corners, blurred shadows, or gradients;
scale pixel art fractionally; set paragraphs in a pixel font; introduce colours
outside the vendored palette without adding them here first.

## Game Surface (the Station village)

The game is the primary control-plane surface (ADR-0148).

**Canvas** — 1280×720 logical, `Phaser.Scale.FIT`, `pixelArt: true`,
`roundPixels: true`, `antialias: false`. Tiles are 16px at ×3 (48px on screen).

**World mapping** — every element is a real projection, never decoration:

| Control plane | Village |
|---|---|
| Station | the town |
| Camp | a house |
| Bindle | a villager outside its house |
| Active rail | the road through town |
| Connection | a gate in the boundary fence |
| Waybill / approval gate | the notice board |
| Quota + spend | the treasury |
| Doctor hazard | a hazard marker on the affected thing |
| Highball (clean board) | the town banner raised |

**Rules** — one sprite per real entity and no decorative extras; hazards are the
only thing that may use `danger`; synthetic or simulated values always render with a
visible `SIMULATED` tag; motion is accent only, so `prefers-reduced-motion` pins
sprite frames and stops ambient motion while every state stays legible; audio is
opt-in, muted by default, and never the sole carrier of a signal.
