# Bo comprehensive animation runtime set

Reviewable Spriterrific exports for Bo, created from the references in `ref/`.

## Runtime-ready assets

| Asset | Frames | Cell | Grid | FPS | Result |
|---|---:|---:|---:|---:|---|
| `../walk-w-asymmetric/bo-walk-left.png` | 36 | 160×157 | 6×6 | 20 | size-contract pass; integrated |
| `jump-w/spritesheet.png` | 6 | 256×256 | 5×2 | 8 | public-ready |
| `hurt-w/spritesheet.png` | 6 | 256×256 | 5×2 | 8 | public-ready |
| `bindle-adjust-w/spritesheet.png` | 10 | 256×256 | 5×2 | 8 | public-ready |
| `wave-w/spritesheet.png` | 10 | 256×256 | 5×2 | 8 | public-ready |
| `sleep-wake-w/spritesheet.png` | 10 | 256×256 | 5×2 | 8 | public-ready |

The repository already supplied east walk, idle, bounce, and blink sheets.
Together these exports add asymmetric west walking plus traversal, reaction,
personality, prop, and rest transitions.

Each action directory includes a transparent spritesheet, GIF preview, manifest,
and `finalize-runtime.json`. Final manifests are copied to
`site/public/parallax/bo-actions/`.

`../runtime-sheet-hygiene-audit.json` checks all five sheets against their
runtime frames and public copies. It also rejects top/left/right cell-edge
bleed and non-neutral foreground pixels. `../runtime-neutral-ink-cleanup.json`
records the monochrome cleanup applied without changing alpha geometry.

The wave has an additional proof at `../wave-w-repair/body-lock-audit.json`:
body, bindle grip, pole, bundle, eyes, feet, and anchor remain identical across
all ten frames; only the free-arm ROI changes. The rejected generated runtime
is retained under `wave-w-rejected-v1/`.

## Identity decisions

- No mouth.
- Dense black shaggy body matching the east walk's lean and mass.
- Arms are black, with thin white ink toon outlines.
- West-facing bindle belongs to the far-side arm behind the body.
- Bundle trails screen-right.
- East gait, ground shadow, cadence, and foot plants are mirrored per cell for
  west; frame order is preserved. Only bindle/arm occlusion is changed.

## Rejected branches retained for audit

- `../walk-w-video/` and `../walk-w-video-v2/`: regenerated gait changed
  body motion and foot timing.
- `../walk-w-36/`: superseded when east gait became the motion authority.
- `../imagegen-action-sources/jump-w/generated/sheet-rejected-v1.png`:
  incorrect jump draft.
- `../imagegen-action-sources/wave-w/generated/sheet-rejected-v1.png`:
  exposed the far-side arm.
- `../imagegen-action-sources/sleep-wake-w/generated/sheet-rejected-mouth-v1.png`:
  added forbidden smile marks.
- `../actions-sleep-wake-w-v2/` and `../actions-sleep-wake-w-v3/`:
  recovery-grid layout trials, not animation candidates.
