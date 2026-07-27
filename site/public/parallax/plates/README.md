# Plates

Supplied artwork. Almost the whole trail band above the hero is made of these —
the file name is the slot, and the slot fixes where it sits and how fast it goes:

| File | Layer | Speed (ground = 1) | Shipped |
|---|---|---|---|
| `sky.png` | furthest back | 0.12x | — |
| `clouds.png` | drifting clouds | 0.28x | yes |
| `hills.png` | distant horizon | 0.40x | yes |
| `poles.png` | telephone poles | 0.55x | yes |
| `trail.png` | the ground, behind Bo | 1.00x | yes |
| `trail-front.png` | the near bank, in front of Bo | 1.00x | yes |

Also accepted: `.webp`, `.avif`, `.jpg`, `.gif`, `.svg`. An empty slot renders
nothing.

Two things the band needs from a plate:

- **It has to repeat cleanly left to right.** The band tiles it end to end; it
  does not mirror the join or blend across it. If the left and right edges do
  not continue each other you will see the seam go past every loop.
- **Compose it full height, at its scene position.** The whole image height maps
  onto the band height, so a plate is a full-height canvas with its content
  placed where it belongs vertically — not a tight crop. The canvas convention
  here is 600px tall, which is 2px per tile unit of the band's 300-unit scene.

Nothing else is needed. The aspect ratio is read out of the file header, the
tile is sized from it, and the scroll duration is derived from that width so
every plate travels at the speed its slot claims and lands the loop back on the
pixels it started from.

## How the shipped plates were made

All six come from the reference plates. Each object was cut out, cropped to the
rows it actually occupies, and normalized to the same 6-level grayscale + alpha
the Bo sprite sheets use — 2.6MB of source crops became ~120KB of plates.

- `clouds.png` — four cloud crops spread across one 2400px tile, all clear of
  the edges, so the wrap needs no blending at all.
- `hills.png` — the horizon strip with its bridge, upscaled 1.5x so its tile
  repeats less often, joined with a 16px crossfade (its own edges differed by
  ~7/255 of antialiasing noise), and faded out along the bottom. That last part
  matters: the strip was cut off a ground line, so its bottom is dead straight,
  and held back as distance a straight edge reads as a rule ruled across the band.
- `poles.png` — three post crops on a 2400px tile, which is exactly 2x the
  1200-unit drawn tile, so the generated wires line up with them. The pole
  centres are repeated in `src/lib/trail-art.ts`; move one and move both.
- `trail.png` / `trail-front.png` — one ground strip, split at the emptiest row
  in it (0.33% ink) into the part behind Bo and the near bank in front of him,
  then each mirrored into an `A A'` tile. Mirroring is what makes an arbitrary
  piece of artwork tile: the join is an exact edge match by construction. The
  best plain-repeat crop of this strip still left a 6.3/255 mismatch, which on
  line art is a visible jog in the ridge.

Grayscale is not incidental — it is what makes the night theme free. Plates take
`filter: invert(1)` in dark mode, which is exactly this design system's ink and
paper inversion.
