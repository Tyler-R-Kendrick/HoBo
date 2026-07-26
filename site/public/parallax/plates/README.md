# Plates

Drop supplied artwork here and it becomes a layer of the trail band above the
hero. The file name is the slot:

| File | Layer | Speed (trail = 1) |
|---|---|---|
| `sky.png` | furthest back | 0.12x |
| `clouds.png` | drifting clouds | 0.28x |
| `hills.png` | distant ground | 0.40x |

Also accepted: `.webp`, `.avif`, `.jpg`, `.gif`, `.svg`.

Two things the band needs from a plate:

- **It has to repeat cleanly left to right.** The band tiles it end to end; it
  does not mirror the join or blend across it. If the left and right edges do
  not continue each other you will see the seam go past every loop.
- **Crop it to the strip you want.** The whole image height is mapped onto the
  band height, so an image that is mostly empty sky renders as a band that is
  mostly empty sky. Trim it to just the part that should show.

Nothing else is needed — the aspect ratio is read from the file, the tile is
sized from it, and the scroll distance follows so the loop lands on the same
pixels it started from. An empty slot renders nothing.

`clouds.png` and `hills.png` are captures from the reference plates: object
crops normalized to the band's 6-level grayscale + alpha and placed on a
600px-tall canvas (2px per tile unit) at their scene height. Plates are
grayscale on purpose — dark mode inverts them with a CSS filter, matching the
design system's exact ink/paper inversion.
