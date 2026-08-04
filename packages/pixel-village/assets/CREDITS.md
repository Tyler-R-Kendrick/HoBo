# Credits and Provenance

Asset ledger for `packages/control-yard/assets/`. Every entry in
[`assets_index.json`](assets_index.json) must have a row here (see
"How to add a new asset" below). Modeled on
`.agents/skills/pixel-snapper/references/credits.md`.

**Art identity: pixel-RPG, built on vendored Kenney CC0 packs.** The previous
in-repo rubberhose artwork (Bo sprites, bindlebug NPCs, guest sprites, ink
parallax plates) was rejected by the product owner and has been removed from
this package; the rows for it are gone from this file along with the files.

All artwork below is by **Kenney** (<https://kenney.nl>) and released under
**CC0-1.0** (Creative Commons Zero, public domain dedication) — on this repo's
pre-approved licence allowlist (`scripts/check-licenses.ts`). Each pack's
upstream `License.txt` is vendored unmodified next to its art. Crediting Kenney
is not mandatory under CC0; we do it anyway.

## Tilesheets and spritesheets

All grids below were measured from the PNG header (gamedev-assets STOP rule)
and are re-verified on every `assets:validate` run.

| Id | File | Measured | Grid | Pack / source | Licence |
|---|---|---|---|---|---|
| `town` | `kenney/tiny-town/tilemap_packed.png` | 192×176 | 12×11 @ 16×16, margin 0, spacing 0 (132 tiles) | Kenney — [Tiny Town](https://kenney.nl/assets/tiny-town) 1.1, `Tilemap/tilemap_packed.png`, unmodified | CC0-1.0 ([`License.txt`](kenney/tiny-town/License.txt)) |
| `dungeon` | `kenney/tiny-dungeon/tilemap_packed.png` | 192×176 | 12×11 @ 16×16, margin 0, spacing 0 (132 tiles) | Kenney — [Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) 1.0, `Tilemap/tilemap_packed.png`, unmodified | CC0-1.0 ([`License.txt`](kenney/tiny-dungeon/License.txt)) |
| `urban` | `kenney/rpg-urban/tilemap_packed.png` | 432×288 | 27×18 @ 16×16, margin 0, spacing 0 (486 tiles) | Kenney — [RPG Urban Pack](https://kenney.nl/assets/rpg-urban-pack) 1.0, `Tilemap/tilemap_packed.png`, unmodified | CC0-1.0 ([`License.txt`](kenney/rpg-urban/License.txt)) |
| `rogue` | `kenney/roguelike-rpg/roguelikeSheet_transparent.png` | 968×526 | 57×31 @ 16×16, margin 0, spacing 1 (1767 tiles) | Kenney — [Roguelike/RPG pack](https://kenney.nl/assets/roguelike-rpg-pack) 1.1, `Spritesheet/roguelikeSheet_transparent.png`, unmodified | CC0-1.0 ([`License.txt`](kenney/roguelike-rpg/License.txt)) |
| `chars` | `kenney/roguelike-characters/roguelikeChar_transparent.png` | 917×203 | 54×12 @ 16×16, margin 0, spacing 1 (648 cells) | Kenney — [Roguelike Characters](https://kenney.nl/assets/roguelike-characters) 1.0, `Spritesheet/roguelikeChar_transparent.png` | CC0-1.0 ([`License.txt`](kenney/roguelike-characters/License.txt)) |
| `ui` | `kenney/fantasy-ui-borders/panel-000.png` | 48×48 | 3×3 @ 16×16, margin 0, spacing 0 (nine-slice) | Kenney — [Fantasy UI Borders](https://kenney.nl/assets/fantasy-ui-borders) 1.0, `PNG/Default/Panel/panel-000.png`, unmodified | CC0-1.0 ([`License.txt`](kenney/fantasy-ui-borders/License.txt)) |

**Modification note (`chars`):** upstream ships `roguelikeChar_transparent.png`
at 918×203, which is 917 px of grid plus one trailing all-transparent spacing
column past the last cell. The vendored copy is cropped to 917×203 so the sheet
satisfies `columns × 16 + spacing × (columns − 1)` exactly and passes
`assets:validate`. The dropped column was verified fully transparent before the
crop; **no pixel content was altered**. Every other sheet is byte-identical to
upstream.

## Images

| Id | File | Measured | Source | Licence / provenance |
|---|---|---|---|---|
| `cargo-particle` | `particles/cargo.png` | 8×8 | In-repo pixel chrome for the yard UI | Original HoBo artwork, MIT with the repo |
| `connection-bay` | `chrome/connection-bay.png` | 32×32 | In-repo pixel chrome for the yard UI | Original HoBo artwork, MIT with the repo |
| `ui-panel-simple` | `kenney/fantasy-ui-borders/panel-009.png` | 48×48 | Kenney — Fantasy UI Borders 1.0, `PNG/Default/Panel/panel-009.png`, unmodified | CC0-1.0 |
| `ui-panel-plain` | `kenney/fantasy-ui-borders/panel-015.png` | 48×48 | Kenney — Fantasy UI Borders 1.0, `PNG/Default/Panel/panel-015.png`, unmodified | CC0-1.0 |
| `ui-panel-frame` | `kenney/fantasy-ui-borders/panel-transparent-center-000.png` | 48×48 | Kenney — Fantasy UI Borders 1.0, `PNG/Default/Transparent center/panel-transparent-center-000.png`, unmodified | CC0-1.0 |
| `ui-divider` | `kenney/fantasy-ui-borders/divider-000.png` | 96×22 | Kenney — Fantasy UI Borders 1.0, `PNG/Default/Divider/divider-000.png`, unmodified | CC0-1.0 |

The Fantasy UI Borders art is white-on-transparent; tint at draw time. The
48×48 panels are nine-sliceable on a 16 px inset.

## Fonts

| File | Role | Source | Licence / provenance |
|---|---|---|---|
| `fonts/kenney/KenneyBlocks.ttf` | Pixel display face (headings, title cards) | Kenney — [Kenney Fonts](https://kenney.nl/assets/kenney-fonts), `Fonts/Kenney Blocks.ttf`, unmodified (renamed only) | **CC0-1.0** — [`fonts/kenney/License.txt`](fonts/kenney/License.txt) |
| `fonts/kenney/KenneyPixel.ttf` | Readable small face (body/UI copy) | Kenney — [Kenney Fonts](https://kenney.nl/assets/kenney-fonts), `Fonts/Kenney Pixel.ttf`, unmodified (renamed only) | **CC0-1.0** — [`fonts/kenney/License.txt`](fonts/kenney/License.txt) |
| `fonts/Chewy-Regular.woff2` | Legacy brand face (site wordmark) | Chewy Regular by Sideshow, via Google Fonts (`google/fonts` repo, `apache/chewy`) | **Apache-2.0** — full text at [`fonts/LICENSE.txt`](fonts/LICENSE.txt). Note: Chewy is Apache-2.0, not OFL, per the upstream `google/fonts` repository. |

## Audio

Mono 22050 Hz WAVs, generated deterministically from the Python standard
library by [`scripts/synth-audio.py`](../scripts/synth-audio.py) — original
in-repo works, no third-party sample packs. Regenerate with
`uv run python scripts/synth-audio.py`.

| Asset | Source | Licence / provenance |
|---|---|---|
| `audio/whistle.wav` | in-repo synthesis (`synth-audio.py: whistle()`) | Original work, MIT with the repo. Brass two-tone whistle for the Highball. |
| `audio/stamp.wav` | in-repo synthesis (`synth-audio.py: stamp()`) | Original work, MIT with the repo. Waybill stamp slam. |
| `audio/spike.wav` | in-repo synthesis (`synth-audio.py: spike()`) | Original work, MIT with the repo. Bill-spike deny. |
| `audio/telegraph.wav` | in-repo synthesis (`synth-audio.py: telegraph()`) | Original work, MIT with the repo. Sounder click for stream liveness. |
| `audio/steam.wav` | in-repo synthesis (`synth-audio.py: steam()`) | Original work, MIT with the repo. Steam hiss for a car needing reauth. |
| `audio/derail.wav` | in-repo synthesis (`synth-audio.py: derail()`) | Original work, MIT with the repo. Derail crunch — the loudest cue. |

## How to add a new asset

1. Prefer a CC0 pack that is already vendored under `kenney/`. If you need a new
   third-party pack, check its SPDX id against the allowlist in
   `scripts/check-licenses.ts` first, vendor only the packed sheets we actually
   use (never the per-tile `Tiles/` folders or `Sample.png`/`Preview.png`), and
   copy the pack's `License.txt` unmodified alongside the art.
2. Measure the sheet first (gamedev-assets STOP rule) and add the entry to
   `assets_index.json` with measured `frameWidth`/`frameHeight`/`columns`/
   `rows`/`margin`/`spacing` and a stable id.
3. Add a row to this file in the matching section: **id, file, measured size,
   source, and licence/provenance**. If the vendored file differs from upstream
   in any way, say exactly how. A manifest entry without a CREDITS row is
   incomplete.
4. Run `pnpm --filter @hobo/pixel-village run assets:validate`,
   `pnpm --filter @hobo/pixel-village run assets:coverage`, and
   `pnpm run licenses:check`.
