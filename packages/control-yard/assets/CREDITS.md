# Credits and Provenance

Asset ledger for `packages/control-yard/assets/`. Every entry in
[`assets_index.json`](assets_index.json) must have a row here (see
"How to add a new asset" below). Modeled on
`.agents/skills/pixel-snapper/references/credits.md`.

Unless noted otherwise, all artwork is **original HoBo artwork** (ink-on-paper
rubberhose per `site/DESIGN.md`), traced from supplied reference plates, and is
covered by this repository's license.

## Backgrounds

| Id | Source | License / provenance |
|---|---|---|
| `sky-cloud` | `site/public/parallax/` cloud plate (site parallax originals) | Original HoBo artwork, traced from supplied reference plates |
| `trail` | `site/public/parallax/` trail plate (site parallax originals) | Original HoBo artwork, traced from supplied reference plates |
| `trail-front` | `site/public/parallax/` trail foreground plate (site parallax originals) | Original HoBo artwork, traced from supplied reference plates |
| `poles` | `site/public/parallax/` telegraph-pole plate (site parallax originals) | Original HoBo artwork, traced from supplied reference plates |

## Images

| Id | Source | License / provenance |
|---|---|---|
| `cargo-particle` | In-repo pixel chrome for the yard UI | Original HoBo artwork |
| `connection-bay` | In-repo pixel chrome for the yard UI | Original HoBo artwork |

## Spritesheets

| Id | Source | License / provenance |
|---|---|---|
| `bo-idle` | `site/public/parallax/` Bo idle sheet (site parallax originals) | Original HoBo artwork, traced from supplied reference plates |
| `bo-walk-east` | `site/public/parallax/` Bo walk sheet, delivery repack 160×157 (site parallax originals) | Original HoBo artwork, traced from supplied reference plates |
| `bo-walk-west` | `site/public/parallax/bo-walk-left.png`, feet re-registered to baseline row 153 — never a mirror of east | Original HoBo artwork, traced from supplied reference plates |
| `bo-jump-w` | `site/public/parallax/bo-actions/jump-w/spritesheet.png` (in-repo Spriterrific pipeline) | Original HoBo artwork, traced from supplied reference plates; produced via Spriterrific run `bo-comprehensive-20260728/runtime/jump-w` (source run `actions-w-v2/jump-w`) |
| `bo-hurt-w` | `site/public/parallax/bo-actions/hurt-w/spritesheet.png` (in-repo Spriterrific pipeline) | Original HoBo artwork, traced from supplied reference plates; produced via Spriterrific run `bo-comprehensive-20260728/runtime/hurt-w` (source run `actions-hurt-w/hurt-w`) |
| `bo-bindle-adjust-w` | `site/public/parallax/bo-actions/bindle-adjust-w/spritesheet.png` (in-repo Spriterrific pipeline) | Original HoBo artwork, traced from supplied reference plates; produced via Spriterrific run `bo-comprehensive-20260728/runtime/bindle-adjust-w` (source run `actions-bindle-adjust-w`) |
| `bo-wave-w` | `site/public/parallax/bo-actions/wave-w/spritesheet.png` (in-repo Spriterrific pipeline, deterministic composite over the shipped idle body) | Original HoBo artwork, traced from supplied reference plates; produced via Spriterrific run `bo-comprehensive-20260728/runtime/wave-w` (source run `wave-w-repair`) |
| `bo-sleep-wake-w` | `site/public/parallax/bo-actions/sleep-wake-w/spritesheet.png` (in-repo Spriterrific pipeline) | Original HoBo artwork, traced from supplied reference plates; produced via Spriterrific run `bo-comprehensive-20260728/runtime/sleep-wake-w` (source run `actions-sleep-wake-w-v4`) |
| `guest-swe-claude` | In-repo guest sprite for the yard UI | Original HoBo artwork |
| `bindlebug-a` | In-repo derivation from `bo/bo-idle.png` (0.5× Lanczos + deterministic ink flat-cap mark) via `scripts/derive-bindlebugs.py`, 2026-08-03 | Original HoBo artwork, derived from the Bo idle sheet |
| `bindlebug-b` | In-repo derivation from `bo/bo-idle.png` (0.5× Lanczos + deterministic ink round-patch mark) via `scripts/derive-bindlebugs.py`, 2026-08-03 | Original HoBo artwork, derived from the Bo idle sheet |
| `bindlebug-c` | In-repo derivation from `bo/bo-idle.png` (0.5× Lanczos + deterministic ink neckerchief mark) via `scripts/derive-bindlebugs.py`, 2026-08-03 | Original HoBo artwork, derived from the Bo idle sheet |

## Fonts

| Id | Source | License / provenance |
|---|---|---|
| `fonts/Chewy-Regular.woff2` | Chewy Regular by Sideshow, via Google Fonts (`google/fonts` repo, `apache/chewy`) | **Apache License 2.0** — full text vendored at [`fonts/LICENSE.txt`](fonts/LICENSE.txt). Note: Chewy is Apache-2.0, not OFL, per the upstream `google/fonts` repository. |

## How to add a new asset

1. Measure the sheet first (gamedev-assets STOP rule) and add the entry to
   `assets_index.json` with measured grid/frame sizes and a stable animation id.
2. Add a row to this file in the matching section: **id, source, and
   license/provenance** (for Spriterrific output, include the run id from the
   action's `finalize-runtime.json`). A manifest entry without a CREDITS row is
   incomplete.
3. Run `pnpm --filter @hobo/control-yard run assets:validate` and
   `pnpm --filter @hobo/control-yard run assets:coverage`.
